import inspect
import re
import requests
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urljoin

from Scrapper import fetch_html
from webScrap.nsp import scrape_nsp_cards
from utils import extract_scholarship_pdfs
from llm import extract_scholarship_info
from db import (
    AmbiguousScholarshipMatch,
    find_existing_scholarship,
    find_scholarships_by_pdf_urls,
    has_scholarship_records,
    scholarship_record_complete,
    upsert_scholarship,
)

SOURCE_METADATA_TIMEOUT_SECONDS = 5


# Each portal has its own scraper module and URL.
PORTALS = [
    {
        "name": "NSP",
        "url": "https://scholarships.gov.in/All-Scholarships",
        "scraper": scrape_nsp_cards,
    },
]


def _scrape_portal(portal, html):
    scraper = portal["scraper"]
    try:
        parameters = inspect.signature(scraper).parameters.values()
        accepts_base_url = any(
            parameter.name == "base_url"
            or parameter.kind == inspect.Parameter.VAR_KEYWORD
            for parameter in parameters
        )
    except (TypeError, ValueError):
        accepts_base_url = False

    if accepts_base_url:
        scholarships = scraper(html, base_url=portal["url"])
    else:
        scholarships = scraper(html)

    # Older portal scrapers may not accept a base URL. Normalize their links
    # here as well so the existing one-argument scraper interface still works.
    for scholarship in scholarships:
        pdf_links = scholarship.get("pdf_links")
        if isinstance(pdf_links, dict):
            scholarship["pdf_links"] = {
                label: urljoin(portal["url"], url) if isinstance(url, str) else url
                for label, url in pdf_links.items()
            }
    return scholarships


def _normalized_url_set(pdf_links):
    if isinstance(pdf_links, dict):
        values = pdf_links.values()
    elif isinstance(pdf_links, (list, tuple, set)):
        values = pdf_links
    else:
        return set()
    return {value.strip() for value in values if isinstance(value, str) and value.strip()}


def _stored_pdf_url_set(value):
    if isinstance(value, dict):
        return _normalized_url_set(value)
    if isinstance(value, (list, tuple, set)):
        return _normalized_url_set(value)
    return set()


def _as_utc_datetime(value):
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value)
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _source_document_status(urls, updated_at, listing_url=None):
    updated_at = _as_utc_datetime(updated_at)
    if not urls or updated_at is None:
        return "unknown"

    checked_urls = list(urls)
    if listing_url:
        checked_urls.append(listing_url)

    for url in checked_urls:
        try:
            response = requests.head(
                url,
                timeout=SOURCE_METADATA_TIMEOUT_SECONDS,
                allow_redirects=True,
            )
            response.raise_for_status()
            last_modified = response.headers.get("Last-Modified")
            if not last_modified:
                return "unknown"
            source_modified = _as_utc_datetime(parsedate_to_datetime(last_modified))
            if source_modified is None or source_modified > updated_at:
                return "changed"
        except Exception as error:
            # If the source cannot confirm its modification time, reprocess it.
            print(f"Could not verify source modification time for {url}: {error}")
            return "unknown"
    return "unchanged"


def _empty_counts():
    return {
        "successes": 0,
        "partial_successes": 0,
        "failures": 0,
        "pdf_failures": 0,
        "skipped": 0,
        "manual_review": 0,
    }


class ManualScholarshipReviewRequired(ValueError):
    """Raised when source evidence cannot identify one safe record to update."""


_CARD_DETAIL_SIGNAL = re.compile(
    r"(?:\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|"
    r"\b(?:application|deadline|eligibility|eligible|income|qualification|"
    r"marks|course|award|amount)\b|\u20B9|rs\.?\s*\d)",
    re.IGNORECASE,
)


def _has_usable_card_information(scholarship):
    if not isinstance(scholarship.get("title"), str) or not scholarship["title"].strip():
        return False

    for key in ("application_open_date", "deadline"):
        if scholarship.get(key):
            return True

    brief_info = scholarship.get("brief_info")
    if isinstance(brief_info, str):
        brief_values = [brief_info]
    elif isinstance(brief_info, (list, tuple)):
        brief_values = brief_info
    else:
        brief_values = []
    return any(
        isinstance(value, str) and _CARD_DETAIL_SIGNAL.search(value)
        for value in brief_values
    )


def _resolve_existing_record(scholarship, pdf_links, database_has_records):
    title = scholarship.get("title")
    provider = scholarship.get("provider")
    current_urls = _normalized_url_set(pdf_links)
    url_candidates = find_scholarships_by_pdf_urls(current_urls)
    exact_url_matches = [
        candidate for candidate in url_candidates
        if _stored_pdf_url_set(candidate.get("official_pdf_urls")) == current_urls
    ] if current_urls else []

    if len(exact_url_matches) > 1:
        raise ManualScholarshipReviewRequired(
            "The exact source PDF URL set identifies multiple records"
        )

    url_match = exact_url_matches[0] if exact_url_matches else None
    try:
        title_match = find_existing_scholarship(title, provider)
    except AmbiguousScholarshipMatch as error:
        if url_match:
            return url_match
        raise ManualScholarshipReviewRequired(
            f"Multiple records match the exact title {title!r}"
        ) from error

    if url_match and title_match and url_match.get("id") != title_match.get("id"):
        raise ManualScholarshipReviewRequired(
            "Exact title and exact source PDF URLs identify different records"
        )
    if url_match:
        return url_match
    if title_match:
        return title_match
    if url_candidates:
        raise ManualScholarshipReviewRequired(
            "Source PDF URLs overlap existing records but do not identify one exact source"
        )
    if database_has_records:
        raise ManualScholarshipReviewRequired(
            "No verified identity match exists; this may be a renamed record or a new scholarship"
        )

    return None


def _existing_record_status(
    scholarship, pdf_links, listing_url, database_has_records=False
):
    existing = _resolve_existing_record(
        scholarship, pdf_links, database_has_records
    )
    if not existing:
        return {
            "exists": False,
            "existing_id": None,
            "unchanged": False,
            "changed": False,
            "rename_verified": False,
        }

    current_urls = _normalized_url_set(pdf_links)
    stored_urls = _stored_pdf_url_set(existing.get("official_pdf_urls"))
    # A complete exact PDF URL set is source identity evidence even when the
    # existing row has missing fields. Keep the canonical title in sync when
    # that identity is verified; this prevents a renamed incomplete row from
    # remaining stale on every subsequent run.
    rename_verified = (
        bool(current_urls)
        and current_urls == stored_urls
        and existing.get("name") != scholarship.get("title")
    )
    if not scholarship_record_complete(existing):
        return {
            "exists": True,
            "existing_id": existing["id"],
            "unchanged": False,
            "changed": False,
            "rename_verified": rename_verified,
        }

    if not current_urls:
        return {
            "exists": True,
            "existing_id": existing["id"],
            "unchanged": False,
            "changed": False,
            "rename_verified": rename_verified,
        }
    if current_urls != stored_urls:
        return {
            "exists": True,
            "existing_id": existing["id"],
            "unchanged": False,
            "changed": True,
            "rename_verified": rename_verified,
        }

    title_changed = rename_verified
    source_status = _source_document_status(
        current_urls, existing.get("updated_at"), listing_url
    )
    return {
        "exists": True,
        "existing_id": existing["id"],
        "unchanged": source_status == "unchanged" and not title_changed,
        "changed": source_status == "changed" or title_changed,
        "rename_verified": rename_verified,
    }


def process_portal(portal):
    counts = _empty_counts()
    print(f"\nProcessing portal: {portal['name']}")

    try:
        html = fetch_html(portal["url"])
        scholarships = _scrape_portal(portal, html)
    except Exception as error:
        print(f"Failed to fetch or scrape portal {portal['name']}: {error}")
        counts["failures"] += 1
        return counts

    print(f"Found {len(scholarships)} scholarships")

    try:
        database_has_records = has_scholarship_records()
    except Exception as error:
        print(f"Failed to verify scholarship identity against the database: {error}")
        counts["failures"] += max(1, len(scholarships))
        return counts

    for index, scholarship in enumerate(scholarships, start=1):
        try:
            title = scholarship.get("title")

            if not title:
                raise ValueError("Scholarship title is missing")

            print(f"\n[{index}/{len(scholarships)}] {title}")
        except Exception as error:
            print(f"Failed to process scholarship: {error}")
            counts["failures"] += 1
            continue

        try:
            pdf_links = scholarship.get("pdf_links") or {}
            try:
                existing_status = _existing_record_status(
                    scholarship,
                    pdf_links,
                    portal["url"],
                    database_has_records=database_has_records,
                )
            except ManualScholarshipReviewRequired as error:
                print(f"Manual review required for {title}: {error}")
                counts["manual_review"] += 1
                continue

            if existing_status["unchanged"]:
                print("Skipped scholarship: complete record and source pages are unchanged")
                counts["skipped"] += 1
                continue

            pdf_result = extract_scholarship_pdfs(
                pdf_links
            )

            counts["pdf_failures"] += len(pdf_result.failed_documents)
            for pdf_title, reason in pdf_result.failed_documents.items():
                print(f"PDF failed for {title} [{pdf_title}]: {reason}")

            if not pdf_result.success and not _has_usable_card_information(scholarship):
                if pdf_result.failed_documents:
                    print(f"Failed scholarship: no usable PDF or listing-card details ({title})")
                    counts["failures"] += 1
                else:
                    print(f"Manual review required for {title}: listing-card details are insufficient")
                    counts["manual_review"] += 1
                continue

            if pdf_result.failed_documents:
                print(
                    f"Continuing with {len(pdf_result.successful_documents)} "
                    f"successful PDF(s); {len(pdf_result.failed_documents)} failed"
                )

            # Card-only extraction is allowed when the card contains concrete
            # details; the LLM omits the PDF section instead of receiving a blank
            # PDF-text prompt.
            extracted_data = extract_scholarship_info(
                scholarship,
                pdf_result.text
            )

            # Insert into PostgreSQL.
            extracted_values = extracted_data.model_dump()
            if pdf_links:
                # These URLs come from the portal card and provide a stable
                # source comparison for later runs; do not ask Gemini to copy them.
                extracted_values["official_pdf_urls"] = pdf_links
            if (existing_status["exists"] and existing_status["changed"]
                    and not pdf_result.failed_documents):
                scholarship_id = upsert_scholarship(
                    extracted_values,
                    existing_id=existing_status["existing_id"],
                    replace_existing=True,
                    update_name=existing_status["rename_verified"],
                )
            elif existing_status["existing_id"] is not None:
                scholarship_id = upsert_scholarship(
                    extracted_values,
                    existing_id=existing_status["existing_id"],
                    update_name=existing_status["rename_verified"],
                )
            else:
                scholarship_id = upsert_scholarship(extracted_values)

            if scholarship_id is None:
                print("Skipped scholarship: existing record is complete")
                counts["skipped"] += 1
            else:
                print(f"Saved scholarship ID: {scholarship_id}")
                if pdf_result.success and not pdf_result.failed_documents:
                    counts["successes"] += 1
                else:
                    counts["partial_successes"] += 1

        except Exception as error:
            print(f"Failed to process scholarship: {error}")
            counts["failures"] += 1

    return counts


def main():
    total_counts = _empty_counts()
    for portal in PORTALS:
        counts = process_portal(portal)
        for key in total_counts:
            total_counts[key] += counts[key]

    print(
        "\nIngestion summary: "
        f"successes={total_counts['successes']}, "
        f"partial_successes={total_counts['partial_successes']}, "
        f"failures={total_counts['failures']}, "
        f"pdf_failures={total_counts['pdf_failures']}, "
        f"skipped={total_counts['skipped']}, "
        f"manual_review={total_counts['manual_review']}"
    )
    if (total_counts["failures"] or total_counts["pdf_failures"]
            or total_counts["manual_review"]):
        raise SystemExit(1)
    return total_counts


if __name__ == "__main__":
    main()
