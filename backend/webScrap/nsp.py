import re
from urllib.parse import unquote, urljoin, urlparse
from bs4 import BeautifulSoup


NSP_LISTING_URL = "https://scholarships.gov.in/All-Scholarships"
PDF_QUERY_MARKER = re.compile(r"(?:^|[?&=])pdf(?:$|[&#])", re.IGNORECASE)


def _is_pdf_link(link, href):
    parsed = urlparse(href)
    decoded_href = unquote(href)
    download_name = link.get("download", "")
    media_type = link.get("type", "").split(";", 1)[0].strip().lower()

    return (
        unquote(parsed.path).lower().endswith(".pdf")
        or bool(re.search(r"\.pdf(?:$|[?#&])", decoded_href, re.IGNORECASE))
        or media_type == "application/pdf"
        or str(download_name).lower().endswith(".pdf")
        or bool(PDF_QUERY_MARKER.search(decoded_href))
    )


def _unique_label(label, links):
    if label not in links:
        return label

    suffix = 2
    while f"{label} ({suffix})" in links:
        suffix += 1
    return f"{label} ({suffix})"


def scrape_nsp_cards(html, base_url=NSP_LISTING_URL):
    soup = BeautifulSoup(html, "html.parser")
    scholarships = []

    for card in soup.select(".col-md-10"):
        title = card.find("h6")
        if not title:
            continue

        info = [span.get_text(" ", strip=True) for span in card.find_all("span")]

        pdfs = {}
        for link in card.find_all("a", href=True):
            href = urljoin(base_url, link["href"].strip())
            if not _is_pdf_link(link, href):
                continue

            label = link.get_text(" ", strip=True)
            if not label:
                label = urlparse(href).path.rsplit("/", 1)[-1] or "PDF document"
            pdfs[_unique_label(label, pdfs)] = href

        scholarships.append({
            "title": title.get_text(" ", strip=True),
            "brief_info": info,
            "pdf_links": pdfs
        })

    return scholarships

