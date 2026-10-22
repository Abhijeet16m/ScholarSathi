"""Parse scholarship records from NSP listing page HTML."""

from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from scraper.fetch import NSP_LISTING_URL


NSP_CARD_SELECTOR = "div.col-md-10"
NSP_TITLE_SELECTOR = "h6"


class NoScholarshipCardsError(ValueError):
    """Raised when the listing HTML contains no recognizable scholarship cards."""


def _clean_text(element) -> str:
    """Collapse layout whitespace while retaining the visible text."""
    return " ".join(" ".join(element.stripped_strings).split())


def _add_field(fields: dict, label: str, value: str) -> None:
    """Add a field while retaining repeated labels instead of overwriting them."""
    if label not in fields:
        fields[label] = value
    elif isinstance(fields[label], list):
        fields[label].append(value)
    else:
        fields[label] = [fields[label], value]


def _link_kind(label: str, href: str) -> str:
    text = f"{label} {href}".casefold()
    if any(word in text for word in ("apply", "application", "student login")):
        return "application"
    if any(word in text for word in ("specification", "guideline", "scheme")):
        return "specification"
    if "faq" in text or "frequently asked" in text:
        return "faq"
    return "document"


def parse_listing_html(
    html: str,
    *,
    base_url: str = NSP_LISTING_URL,
) -> list[dict]:
    """Parse NSP scholarship cards into normalized records.

    Each record contains a ``title``, a ``fields`` mapping of visible labeled
    text, and ``links`` with a label, absolute URL, and inferred link type.
    Links without an HTTP(S) destination are ignored; documents are never fetched.
    """
    soup = BeautifulSoup(html, "html.parser")
    records = []

    for card in soup.select(NSP_CARD_SELECTOR):
        title_element = card.select_one(NSP_TITLE_SELECTOR)
        if title_element is None:
            continue
        title = _clean_text(title_element)
        if not title:
            continue

        fields = {}
        additional_text = []
        for span in card.select("span"):
            if title_element in span.parents:
                continue
            text = _clean_text(span)
            if not text:
                continue
            if ":" in text:
                label, value = text.split(":", 1)
                label, value = label.strip(), value.strip()
                if label and value:
                    _add_field(fields, label, value)
                elif value:
                    additional_text.append(value)
            else:
                additional_text.append(text)

        if additional_text:
            fields["additional_text"] = additional_text

        links = []
        seen_links = set()
        for anchor in card.select("a[href]"):
            raw_href = anchor.get("href", "").strip()
            absolute_url = urljoin(base_url, raw_href)
            if urlparse(absolute_url).scheme not in {"http", "https"}:
                continue
            label = _clean_text(anchor) or raw_href
            identity = (label, absolute_url)
            if identity in seen_links:
                continue
            seen_links.add(identity)
            links.append(
                {
                    "label": label,
                    "url": absolute_url,
                    "type": _link_kind(label, absolute_url),
                }
            )

        records.append({"title": title, "fields": fields, "links": links})

    if not records:
        raise NoScholarshipCardsError(
            f"No scholarship cards found using selector {NSP_CARD_SELECTOR!r} "
            f"and title selector {NSP_TITLE_SELECTOR!r}. The page structure may have changed."
        )

    return records
