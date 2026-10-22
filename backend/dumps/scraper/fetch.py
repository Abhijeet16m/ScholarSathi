"""Fetch HTML pages from scholarship portals."""

import requests


NSP_LISTING_URL = "https://scholarships.gov.in/All-Scholarships"
DEFAULT_TIMEOUT_SECONDS = 20
USER_AGENT = "ScholarSathi/1.0"


class PageFetchError(RuntimeError):
    """Raised when a portal page cannot be fetched successfully."""


def fetch_html(
    url: str = NSP_LISTING_URL,
    *,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> str:
    """Download and return a page's HTML, reporting network and HTTP errors."""
    try:
        response = requests.get(
            url,
            timeout=timeout,
            headers={"User-Agent": USER_AGENT},
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise PageFetchError(f"Failed to fetch portal page {url}: {exc}") from exc

    return response.text
