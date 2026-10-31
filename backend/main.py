import inspect
import requests
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urljoin

from Scrapper import fetch_html
from webScrap.nsp import scrape_nsp_cards
from utils import extract_scholarship_pdfs
from llm import extract_scholarship_info
from db import (
    find_existing_scholarship,
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


def _existing_record_status(scholarship, pdf_links, listing_url):
    existing = find_existing_scholarship(
        scholarship.get("title"), scholarship.get("provider")
    )
    if not existing or not scholarship_record_complete(existing):
        return {
            "exists": bool(existing),
            "existing_id": existing.get("id") if existing else None,
            "unchanged": False,
            "changed": False,
        }

    current_urls = _normalized_url_set(pdf_links)
    stored_urls = _stored_pdf_url_set(existing.get("official_pdf_urls"))
    if not current_urls or current_urls != stored_urls:
        return {
            "exists": True,
            "existing_id": existing["id"],
            "unchanged": False,
            "changed": True,
        }

    source_status = _source_document_status(
        current_urls, existing.get("updated_at"), listing_url
    )
    return {
        "exists": True,
        "existing_id": existing["id"],
        "unchanged": source_status == "unchanged",
        "changed": source_status == "changed",
    }


def _empty_counts():
    return {"successes": 0, "failures": 0, "skipped": 0}


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
            existing_status = _existing_record_status(
                scholarship, pdf_links, portal["url"]
            )
            if existing_status["unchanged"]:
                print("Skipped scholarship: complete record and source pages are unchanged")
                counts["skipped"] += 1
                continue

            pdf_result = extract_scholarship_pdfs(
                pdf_links
            )

            if not pdf_result.success:
                print(
                    "Skipping scholarship: no PDF produced meaningful text "
                    f"({len(pdf_result.successful_documents)} succeeded, "
                    f"{len(pdf_result.failed_documents)} failed)"
                )
                if pdf_result.failed_documents:
                    counts["failures"] += 1
                else:
                    counts["skipped"] += 1
                continue

            if pdf_result.failed_documents:
                print(
                    f"Continuing with {len(pdf_result.successful_documents)} "
                    f"successful PDF(s); {len(pdf_result.failed_documents)} failed"
                )

            # Extract structured scholarship data with Gemini.
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
                )
            elif existing_status["existing_id"] is not None:
                scholarship_id = upsert_scholarship(
                    extracted_values,
                    existing_id=existing_status["existing_id"],
                )
            else:
                scholarship_id = upsert_scholarship(extracted_values)

            if scholarship_id is None:
                print("Skipped scholarship: existing record is complete")
                counts["skipped"] += 1
            else:
                print(f"Saved scholarship ID: {scholarship_id}")
                counts["successes"] += 1

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
        f"failures={total_counts['failures']}, "
        f"skipped={total_counts['skipped']}"
    )
    if total_counts["failures"]:
        raise SystemExit(1)
    return total_counts


if __name__ == "__main__":
    main()
