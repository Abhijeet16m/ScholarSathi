"""Download one selected PDF and extract text while preserving page numbers."""

from dataclasses import dataclass
from io import BytesIO
from urllib.parse import urlparse

import requests
from pypdf import PdfReader


DEFAULT_TIMEOUT_SECONDS = 30
DEFAULT_MAX_PDF_BYTES = 20 * 1024 * 1024
DOWNLOAD_CHUNK_BYTES = 64 * 1024


class PDFExtractionError(RuntimeError):
    """Base class for PDF download or text extraction errors."""


class PDFDownloadError(PDFExtractionError):
    """Raised when a PDF URL cannot be fetched."""


class PDFTooLargeError(PDFExtractionError):
    """Raised when a PDF exceeds the configured download size limit."""


class InvalidPDFError(PDFExtractionError):
    """Raised when the provided bytes are not a readable PDF."""


class EmptyPDFTextError(PDFExtractionError):
    """Raised when a valid PDF contains no extractable text."""


@dataclass(frozen=True)
class PDFPageText:
    page_number: int
    text: str


@dataclass(frozen=True)
class ExtractedPDFText:
    source_url: str | None
    pages: tuple[PDFPageText, ...]

    @property
    def text(self) -> str:
        """Return text with explicit page headings for downstream extraction."""
        return "\n\n".join(
            f"[Page {page.page_number}]\n{page.text}" for page in self.pages
        )


def _download_pdf(url: str, *, timeout: float, max_bytes: int) -> bytes:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise PDFDownloadError("PDF URL must be an absolute HTTP(S) URL")

    try:
        response = requests.get(url, timeout=timeout, stream=True)
    except requests.RequestException as exc:
        raise PDFDownloadError("PDF download failed due to a network error") from exc

    try:
        response.raise_for_status()
        content_length = response.headers.get("Content-Length")
        if content_length:
            try:
                if int(content_length) > max_bytes:
                    raise PDFTooLargeError(
                        f"PDF exceeds the configured {max_bytes}-byte limit"
                    )
            except ValueError:
                pass

        contents = bytearray()
        for chunk in response.iter_content(chunk_size=DOWNLOAD_CHUNK_BYTES):
            if not chunk:
                continue
            contents.extend(chunk)
            if len(contents) > max_bytes:
                raise PDFTooLargeError(
                    f"PDF exceeds the configured {max_bytes}-byte limit"
                )
        return bytes(contents)
    except PDFTooLargeError:
        raise
    except requests.RequestException as exc:
        raise PDFDownloadError("PDF download failed due to an HTTP or network error") from exc
    finally:
        response.close()


def extract_pdf_text(
    *,
    pdf_url: str | None = None,
    pdf_bytes: bytes | None = None,
    source_url: str | None = None,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    max_bytes: int = DEFAULT_MAX_PDF_BYTES,
) -> ExtractedPDFText:
    """Extract text from one PDF URL or byte string, preserving page boundaries.

    The URL form fetches only the single document explicitly passed by the caller.
    OCR is not attempted; scanned image-only PDFs raise ``EmptyPDFTextError``.
    """
    if (pdf_url is None) == (pdf_bytes is None):
        raise ValueError("Provide exactly one of pdf_url or pdf_bytes")
    if timeout <= 0:
        raise ValueError("timeout must be positive")
    if max_bytes <= 0:
        raise ValueError("max_bytes must be positive")

    if pdf_url is not None:
        data = _download_pdf(pdf_url, timeout=timeout, max_bytes=max_bytes)
        document_url = pdf_url
    else:
        if not isinstance(pdf_bytes, (bytes, bytearray)):
            raise TypeError("pdf_bytes must be bytes or bytearray")
        if len(pdf_bytes) > max_bytes:
            raise PDFTooLargeError(f"PDF exceeds the configured {max_bytes}-byte limit")
        data = bytes(pdf_bytes)
        document_url = source_url

    if document_url is not None:
        parsed = urlparse(document_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("source_url must be an absolute HTTP(S) URL")

    try:
        reader = PdfReader(BytesIO(data), strict=False)
        if reader.is_encrypted:
            raise InvalidPDFError("Encrypted PDFs are not supported")
        pages = tuple(
            PDFPageText(page_number=index, text=(page.extract_text() or "").strip())
            for index, page in enumerate(reader.pages, start=1)
        )
    except InvalidPDFError:
        raise
    except Exception as exc:
        raise InvalidPDFError("The supplied content is not a readable PDF") from exc

    if not any(page.text for page in pages):
        raise EmptyPDFTextError("The PDF contains no extractable text; OCR is not enabled")

    return ExtractedPDFText(source_url=document_url, pages=pages)
