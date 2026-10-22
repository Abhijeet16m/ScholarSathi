import unittest
from unittest.mock import Mock, patch

import requests
from pypdf import PdfWriter

from backend.dumps.scraper.pdf_extractor import (
    EmptyPDFTextError,
    InvalidPDFError,
    PDFDownloadError,
    PDFTooLargeError,
    extract_pdf_text,
)


def minimal_pdf_bytes(page_count=2):
    writer = PdfWriter()
    for _ in range(page_count):
        writer.add_blank_page(width=200, height=200)
    from io import BytesIO

    output = BytesIO()
    writer.write(output)
    return output.getvalue()


class PDFExtractorTests(unittest.TestCase):
    @patch("scraper.pdf_extractor.PdfReader")
    def test_extracts_text_and_preserves_page_numbers(self, reader_class):
        reader = Mock()
        reader.is_encrypted = False
        reader.pages = [Mock(), Mock()]
        reader.pages[0].extract_text.return_value = "Annual income below Rs. 2 lakh"
        reader.pages[1].extract_text.return_value = "Minimum marks: 60%"
        reader_class.return_value = reader

        result = extract_pdf_text(pdf_bytes=minimal_pdf_bytes())

        self.assertEqual(
            [(page.page_number, page.text) for page in result.pages],
            [(1, "Annual income below Rs. 2 lakh"), (2, "Minimum marks: 60%")],
        )
        self.assertIn("[Page 2]\nMinimum marks: 60%", result.text)

    def test_invalid_pdf_bytes_raise_clear_error(self):
        with self.assertLogs("pypdf", level="WARNING"):
            with self.assertRaises(InvalidPDFError):
                extract_pdf_text(pdf_bytes=b"this is not a PDF")

    @patch("scraper.pdf_extractor.PdfReader")
    def test_empty_text_raises_without_attempting_ocr(self, reader_class):
        reader = Mock()
        reader.is_encrypted = False
        reader.pages = [Mock()]
        reader.pages[0].extract_text.return_value = "  "
        reader_class.return_value = reader

        with self.assertRaises(EmptyPDFTextError):
            extract_pdf_text(pdf_bytes=minimal_pdf_bytes(1))

    @patch("scraper.pdf_extractor.requests.get")
    def test_url_download_is_bounded_and_keeps_source_url(self, get):
        response = Mock()
        response.headers = {"Content-Length": "4"}
        response.iter_content.return_value = [b"%PDF"]
        response.raise_for_status.return_value = None
        get.return_value = response

        with self.assertLogs("pypdf", level="WARNING"):
            with self.assertRaises(InvalidPDFError):
                extract_pdf_text(pdf_url="https://example.test/doc.pdf", max_bytes=8)

        get.assert_called_once_with(
            "https://example.test/doc.pdf", timeout=30, stream=True
        )
        response.close.assert_called_once_with()

    @patch("scraper.pdf_extractor.requests.get")
    def test_rejects_oversized_content_length_before_reading(self, get):
        response = Mock()
        response.headers = {"Content-Length": "100"}
        get.return_value = response

        with self.assertRaises(PDFTooLargeError):
            extract_pdf_text(pdf_url="https://example.test/doc.pdf", max_bytes=10)

        response.iter_content.assert_not_called()
        response.close.assert_called_once_with()

    @patch("scraper.pdf_extractor.requests.get")
    def test_enforces_size_limit_while_streaming(self, get):
        response = Mock()
        response.headers = {}
        response.iter_content.return_value = [b"123", b"456"]
        get.return_value = response

        with self.assertRaises(PDFTooLargeError):
            extract_pdf_text(pdf_url="https://example.test/doc.pdf", max_bytes=5)

        response.close.assert_called_once_with()

    @patch("scraper.pdf_extractor.requests.get")
    def test_wraps_http_status_errors_and_closes_response(self, get):
        response = Mock()
        response.headers = {}
        response.raise_for_status.side_effect = requests.HTTPError("404 Not Found")
        get.return_value = response

        with self.assertRaises(PDFDownloadError):
            extract_pdf_text(pdf_url="https://example.test/doc.pdf")

        response.close.assert_called_once_with()

    @patch("scraper.pdf_extractor.requests.get")
    def test_wraps_network_errors(self, get):
        get.side_effect = requests.Timeout("offline")

        with self.assertRaises(PDFDownloadError):
            extract_pdf_text(pdf_url="https://example.test/doc.pdf")


if __name__ == "__main__":
    unittest.main()
