import unittest
from unittest.mock import Mock, patch

import requests

from backend.dumps.scraper.fetch import (
    DEFAULT_TIMEOUT_SECONDS,
    NSP_LISTING_URL,
    PageFetchError,
    USER_AGENT,
    fetch_html,
)


class FetchHtmlTests(unittest.TestCase):
    @patch("scraper.fetch.requests.get")
    def test_returns_html_and_uses_request_defaults(self, get):
        response = Mock()
        response.text = "<html>listing</html>"
        get.return_value = response

        result = fetch_html()

        self.assertEqual(result, "<html>listing</html>")
        get.assert_called_once_with(
            NSP_LISTING_URL,
            timeout=DEFAULT_TIMEOUT_SECONDS,
            headers={"User-Agent": USER_AGENT},
        )
        response.raise_for_status.assert_called_once_with()

    @patch("scraper.fetch.requests.get")
    def test_wraps_network_errors_with_a_clear_message(self, get):
        get.side_effect = requests.Timeout("request timed out")

        with self.assertRaisesRegex(PageFetchError, "Failed to fetch portal page"):
            fetch_html("https://example.test/listing", timeout=3)

    @patch("scraper.fetch.requests.get")
    def test_wraps_http_status_errors(self, get):
        response = Mock()
        response.raise_for_status.side_effect = requests.HTTPError("503 Service Unavailable")
        get.return_value = response

        with self.assertRaisesRegex(PageFetchError, "Failed to fetch portal page"):
            fetch_html()


if __name__ == "__main__":
    unittest.main()
