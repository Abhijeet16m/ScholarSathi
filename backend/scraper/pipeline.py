"""NSP-only orchestration for safe scholarship extraction and persistence."""

import hashlib
import json
import re
import sys
from dataclasses import dataclass
from typing import Any, Callable, Mapping
from urllib.parse import urlsplit, urlunsplit

from scraper.eligibility_extractor import extract_eligibility
from scraper.fetch import fetch_html
from scraper.parser import parse_listing_html
from scraper.pdf_extractor import extract_pdf_text
from scraper.portal_config import get_portal_config
from scraper.scholarship_repository import get_content_hash, upsert_scholarship_with_rules


DETAIL_WORDS = {"detail", "details"}
DETAIL_PHRASES = {"know more", "read more"}
GUIDELINE_WORDS = ("guideline", "specification", "scheme")
PROVIDER_LABELS = {"provider", "ministry", "department", "ministry department"}


class PipelineConfigurationError(RuntimeError):
    """Raised when the persisted NSP portal configuration is unavailable or disabled."""


@dataclass(frozen=True)
class CardResult:
    title: str
    status: str
    reason: str | None = None
    source_url: str | None = None


@dataclass(frozen=True)
class PipelineReport:
    results: tuple[CardResult, ...]


CARD_STATUSES = ("processed", "unchanged", "skipped", "failed")


def _clean(value: Any) -> str:
    return " ".join(str(value).split())


def _normalized_fields(fields: Mapping[str, Any]) -> dict[str, Any]:
    normalized = {}
    for key, value in fields.items():
        label = _clean(key).casefold()
        if isinstance(value, list):
            normalized[label] = [_clean(item) for item in value]
        else:
            normalized[label] = _clean(value)
    return {key: normalized[key] for key in sorted(normalized)}


def _canonical_url(url: str) -> str:
    parts = urlsplit(url.strip())
    host = (parts.hostname or "").casefold()
    if parts.port:
        host = f"{host}:{parts.port}"
    if parts.username or parts.password:
        raise ValueError("URLs containing user information are not supported")
    path = parts.path or "/"
    if path != "/":
        path = path.rstrip("/")
    return urlunsplit((parts.scheme.casefold(), host, path, parts.query, ""))


def _normalized_links(record: Mapping[str, Any]) -> list[dict[str, str]]:
    links = []
    for link in record.get("links", []):
        if not isinstance(link, Mapping) or not link.get("url"):
            continue
        links.append(
            {
                "label": _clean(link.get("label", "")).casefold(),
                "type": _clean(link.get("type", "document")).casefold(),
                "url": _canonical_url(str(link["url"])),
            }
        )
    return sorted(links, key=lambda item: (item["type"], item["label"], item["url"]))


def _identity_url(record: Mapping[str, Any], portal_host: str) -> tuple[str | None, str | None]:
    detail_candidates = set()
    for link in record.get("links", []):
        if not isinstance(link, Mapping) or not link.get("url"):
            continue
        label = _clean(link.get("label", "")).casefold()
        path = urlsplit(str(link["url"])).path.casefold()
        label_words = set(label.split())
        is_detail_link = bool(label_words & DETAIL_WORDS) or label in DETAIL_PHRASES
        if path.endswith(".pdf") or not is_detail_link:
            continue
        url = _canonical_url(str(link["url"]))
        if urlsplit(url).hostname != portal_host:
            continue
        detail_candidates.add(url)
    if len(detail_candidates) == 1:
        return next(iter(detail_candidates)), None
    if len(detail_candidates) > 1:
        return None, "multiple scholarship detail URLs were found; identity is ambiguous"

    # Fallback for portals like NSP where cards do not provide an HTML detail page,
    # but link directly to official guideline/specification documents.
    guideline_candidates = set()
    for link in record.get("links", []):
        if not isinstance(link, Mapping) or not link.get("url"):
            continue
        url = str(link["url"])
        text = f"{link.get('label', '')} {url}".casefold()
        path = urlsplit(url).path.casefold()
        if (
            path.endswith(".pdf")
            and not path.endswith("/null")
            and any(word in text for word in GUIDELINE_WORDS)
            and urlsplit(url).hostname == portal_host
        ):
            guideline_candidates.add(_canonical_url(url))

    if not guideline_candidates:
        return None, "no scholarship-specific official detail URL was found"
    if len(guideline_candidates) > 1:
        return None, "multiple official guideline URLs were found; identity is ambiguous"
    return next(iter(guideline_candidates)), None


def _guideline_pdf_url(record: Mapping[str, Any]) -> tuple[str | None, str | None]:
    candidates = set()
    for link in record.get("links", []):
        if not isinstance(link, Mapping) or not link.get("url"):
            continue
        url = str(link["url"])
        text = f"{link.get('label', '')} {url}".casefold()
        if urlsplit(url).path.casefold().endswith(".pdf") and any(
            word in text for word in GUIDELINE_WORDS
        ):
            candidates.add(_canonical_url(url))
    if not candidates:
        return None, "no scholarship guideline/specification PDF was found"
    if len(candidates) != 1:
        return None, "multiple guideline/specification PDFs were found; document choice is ambiguous"
    return next(iter(candidates)), None


def _provider(fields: Mapping[str, Any]) -> str | None:
    for label, value in fields.items():
        if label.casefold() in PROVIDER_LABELS:
            return _clean(value) or None
    return None


def _deadline(fields: Mapping[str, Any]):
    for label, value in fields.items():
        label_lower = label.casefold()
        if any(term in label_lower for term in ("open till", "last date", "deadline")):
            raw = _clean(value if isinstance(value, str) else value[0] if value else "")
            match = re.search(r"(\d{2})-(\d{2})-(\d{4})", raw)
            if match:
                day, month, year = map(int, match.groups())
                try:
                    from datetime import date

                    return date(year, month, day)
                except ValueError:
                    pass
    return None


def _application_url(links: list[dict[str, str]]) -> str | None:
    candidates = sorted({link["url"] for link in links if link["type"] == "application"})
    return candidates[0] if len(candidates) == 1 else None


def _content_hash(
    record: Mapping[str, Any], normalized_fields: Mapping[str, Any], links: list[dict[str, str]], pdf_text: str
) -> str:
    payload = {
        "title": _clean(record["title"]),
        "fields": normalized_fields,
        "links": links,
        "pdf_text": "\n".join(_clean(line) for line in pdf_text.splitlines()),
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def run_nsp_pipeline(
    *,
    connection=None,
    portal_config: Mapping[str, Any] | None = None,
    fetcher: Callable = fetch_html,
    parser: Callable = parse_listing_html,
    pdf_extractor: Callable = extract_pdf_text,
    eligibility_extractor: Callable = extract_eligibility,
    hash_reader: Callable = get_content_hash,
    writer: Callable = upsert_scholarship_with_rules,
    limit: int | None = None,
    title_filter: str | None = None,
) -> PipelineReport:
    """Fetch NSP, process changed cards, and persist each successful card atomically.

    An optional connection and callable overrides keep this orchestration testable
    without `.env`, database access, HTTP, or model calls.
    """
    config = portal_config or get_portal_config("nsp", connection=connection)
    if not config:
        raise PipelineConfigurationError(
            "NSP portal configuration is missing; apply the portal config migration first"
        )
    if config.get("portal_key") != "nsp" or not config.get("enabled"):
        raise PipelineConfigurationError("NSP portal configuration is invalid or disabled")

    listing_url = config["listing_url"]
    base_url = config["base_url"]
    html = fetcher(listing_url)
    records = parser(html, base_url=listing_url)
    if title_filter:
        filter_term = title_filter.strip().casefold()
        records = [
            r for r in records if filter_term in _clean(r.get("title", "")).casefold()
        ]
    if limit is not None and limit > 0:
        records = records[:limit]
    portal_host = (urlsplit(base_url).hostname or "").casefold()

    identity_matches: dict[str, int] = {}
    identities: list[tuple[str | None, str | None]] = []
    for record in records:
        identity, reason = _identity_url(record, portal_host)
        identities.append((identity, reason))
        if identity:
            identity_matches[identity] = identity_matches.get(identity, 0) + 1

    results = []
    for record, (source_url, identity_reason) in zip(records, identities):
        title = _clean(record.get("title", ""))
        if identity_reason:
            results.append(CardResult(title, "skipped", identity_reason))
            continue
        if identity_matches[source_url] > 1:
            results.append(
                CardResult(title, "skipped", "detail URL is shared by multiple listing cards", source_url)
            )
            continue

        pdf_url, pdf_reason = _guideline_pdf_url(record)
        if pdf_reason:
            results.append(CardResult(title, "skipped", pdf_reason, source_url))
            continue

        try:
            document = pdf_extractor(pdf_url=pdf_url)
            fields = _normalized_fields(record.get("fields", {}))
            links = _normalized_links(record)
            content_hash = _content_hash(record, fields, links, document.text)
            stored_hash = hash_reader("nsp", source_url, connection=connection)
            if stored_hash == content_hash:
                results.append(CardResult(title, "unchanged", source_url=source_url))
                continue

            eligibility = eligibility_extractor(document)
            pdf_urls = sorted(
                {
                    link["url"]
                    for link in links
                    if urlsplit(link["url"]).path.casefold().endswith(".pdf")
                }
            )
            scholarship = {
                "source_portal": "nsp",
                "source_url": source_url,
                "name": title,
                "provider": _provider(fields),
                "description": json.dumps(fields, ensure_ascii=False, sort_keys=True),
                "application_url": _application_url(links),
                "deadline": _deadline(fields),
                "official_pdf_urls": pdf_urls,
            }
            writer(scholarship, eligibility, content_hash, connection=connection)
            results.append(CardResult(title, "processed", source_url=source_url))
        except Exception as exc:
            results.append(
                CardResult(title, "failed", f"{type(exc).__name__}: {exc}", source_url)
            )

    return PipelineReport(tuple(results))


def format_report(report: PipelineReport) -> str:
    """Return a readable count summary and diagnostics for skipped/failed cards."""
    counts = {status: 0 for status in CARD_STATUSES}
    for result in report.results:
        if result.status in counts:
            counts[result.status] += 1

    lines = ["NSP pipeline summary:"]
    lines.extend(f"  {status.capitalize()}: {counts[status]}" for status in CARD_STATUSES)
    for result in report.results:
        if result.status in {"skipped", "failed"}:
            title = result.title or "(untitled card)"
            reason = _safe_diagnostic(result.reason or "No reason provided")
            lines.append(f"  {result.status.capitalize()}: {title} — {reason}")
    return "\n".join(lines)


def _safe_diagnostic(message: str) -> str:
    """Keep actionable exception details while removing common credential forms."""
    value = re.sub(r"AIza[0-9A-Za-z_-]{20,}", "[redacted]", str(message))
    value = re.sub(
        r"(?i)(api[_-]?key|apikey|authorization|token|secret|password)\s*[:=]\s*(?:Bearer\s+)?[^\s,;]+",
        r"\1=[redacted]",
        value,
    )

    def redact_url(match):
        raw_url = match.group(0)
        punctuation = ""
        while raw_url and raw_url[-1] in ".,);]":
            punctuation = raw_url[-1] + punctuation
            raw_url = raw_url[:-1]
        try:
            parts = urlsplit(raw_url)
            host = parts.hostname or "[redacted-host]"
            if parts.port:
                host = f"{host}:{parts.port}"
            safe_url = urlunsplit((parts.scheme, host, parts.path, "", ""))
        except ValueError:
            safe_url = "[redacted-url]"
        return safe_url + punctuation

    return re.sub(r"(?:https?|postgres(?:ql)?)://[^\s<>\"']+", redact_url, value)


def main(argv: list[str] | None = None) -> int:
    """CLI policy: exit 1 on a run-level or card-level failure; skipped is non-fatal."""
    import argparse

    argument_parser = argparse.ArgumentParser(
        description="Fetch and process NSP scholarships. Exit 1 if any card fails; skipped cards are non-fatal."
    )
    argument_parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of cards to process",
    )
    argument_parser.add_argument(
        "--filter",
        type=str,
        default=None,
        help="Only process cards whose title contains this filter text (case-insensitive)",
    )
    args = argument_parser.parse_args(argv)

    try:
        report = run_nsp_pipeline(limit=args.limit, title_filter=args.filter)
    except Exception as exc:
        message = _safe_diagnostic(str(exc))
        print(f"NSP pipeline failed ({type(exc).__name__}): {message}", file=sys.stderr)
        return 1

    print(format_report(report))
    return 1 if any(result.status == "failed" for result in report.results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
