from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import requests
import tempfile
import threading
from docling.document_converter import DocumentConverter


# Keep the operational ceiling explicit and configurable without requiring a new
# dependency. The cache is persistent across runs and separate from per-run files.
PDF_MAX_DOWNLOAD_BYTES = int(os.getenv("SCHOLARSHIP_PDF_MAX_BYTES", 50 * 1024 * 1024))
PDF_MAX_WORKERS = min(4, max(1, int(os.getenv("SCHOLARSHIP_PDF_WORKERS", "2"))))


def _default_pdf_cache_dir():
    configured = os.getenv("SCHOLARSHIP_PDF_CACHE_DIR")
    if configured:
        return Path(configured)
    if os.getenv("LOCALAPPDATA"):
        return Path(os.environ["LOCALAPPDATA"]) / "ScholarSathi" / "pdf_cache"
    return Path(os.getenv("XDG_CACHE_HOME", str(Path.home() / ".cache"))) / "scholarshipsathi" / "pdf"


PDF_CACHE_DIR = _default_pdf_cache_dir()
PDF_TEMP_DIR = Path(tempfile.gettempdir()) / "scholarship_pdf_work"
PDF_DOWNLOAD_TIMEOUT_SECONDS = 60
PDF_CHUNK_SIZE = 64 * 1024
PDF_CACHE_VERSION = 1


# Docling initializes and caches its PDF pipeline on the converter. Reuse one
# converter; retain the lock because converter thread safety is not established.
_document_converter = None
_document_converter_lock = threading.RLock()
_url_locks_guard = threading.Lock()
_url_locks = {}


def _get_document_converter():
    global _document_converter
    with _document_converter_lock:
        if _document_converter is None:
            _document_converter = DocumentConverter()
        return _document_converter


def _lock_for_url(url):
    with _url_locks_guard:
        return _url_locks.setdefault(url, threading.Lock())


@dataclass
class PdfExtractionResult:
    text: str
    successful_documents: list[str]
    failed_documents: dict[str, str]

    @property
    def success(self):
        return bool(self.text.strip())


def _has_meaningful_text(text):
    return isinstance(text, str) and any(character.isalnum() for character in text)


def _cache_paths(url):
    cache_key = hashlib.sha256(url.encode("utf-8")).hexdigest()
    return PDF_CACHE_DIR / f"{cache_key}.json"


def _read_cache(path):
    try:
        with path.open("r", encoding="utf-8") as cache_file:
            value = json.load(cache_file)
        if (isinstance(value, dict)
                and value.get("cache_version") == PDF_CACHE_VERSION
                and isinstance(value.get("text"), str)
                and isinstance(value.get("sha256"), str)):
            return value
    except (OSError, ValueError, TypeError):
        pass
    return None


def _write_cache(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent,
            prefix=f"{path.stem}.", suffix=".tmp", delete=False,
        ) as cache_file:
            temp_path = Path(cache_file.name)
            json.dump(value, cache_file, ensure_ascii=False)
        os.replace(temp_path, path)
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink()


def _download_pdf(url, cache):
    """Stream a bounded PDF to a unique work file and return (path, metadata)."""
    headers = {"User-Agent": "ScholarSathi/1.0"}
    if cache:
        if cache.get("etag"):
            headers["If-None-Match"] = cache["etag"]
        if cache.get("last_modified"):
            headers["If-Modified-Since"] = cache["last_modified"]

    response = requests.get(
        url,
        headers=headers,
        timeout=PDF_DOWNLOAD_TIMEOUT_SECONDS,
        stream=True,
    )
    temp_path = None
    try:
        if response.status_code == 304 and cache:
            response.close()
            return None, cache

        response.raise_for_status()
        content_length = response.headers.get("Content-Length")
        if content_length:
            try:
                declared_size = int(content_length)
            except (TypeError, ValueError):
                declared_size = None
            if declared_size is not None and declared_size > PDF_MAX_DOWNLOAD_BYTES:
                raise ValueError(
                    f"PDF exceeds the {PDF_MAX_DOWNLOAD_BYTES}-byte download limit"
                )

        PDF_TEMP_DIR.mkdir(parents=True, exist_ok=True)
        digest = hashlib.sha256()
        total_bytes = 0
        prefix = bytearray()
        with tempfile.NamedTemporaryFile(
            mode="wb", dir=PDF_TEMP_DIR, suffix=".pdf", delete=False,
        ) as pdf_file:
            temp_path = Path(pdf_file.name)
            for chunk in response.iter_content(chunk_size=PDF_CHUNK_SIZE):
                if not chunk:
                    continue
                total_bytes += len(chunk)
                if total_bytes > PDF_MAX_DOWNLOAD_BYTES:
                    raise ValueError(
                        f"PDF exceeds the {PDF_MAX_DOWNLOAD_BYTES}-byte download limit"
                    )
                if len(prefix) < 1024:
                    prefix.extend(chunk[:1024 - len(prefix)])
                digest.update(chunk)
                pdf_file.write(chunk)

        if b"%PDF-" not in prefix:
            raise ValueError("Downloaded response does not have a valid PDF header")

        return temp_path, {
            "sha256": digest.hexdigest(),
            "etag": response.headers.get("ETag"),
            "last_modified": response.headers.get("Last-Modified"),
        }
    except Exception:
        if temp_path and temp_path.exists():
            temp_path.unlink()
        raise
    finally:
        response.close()


def _convert_pdf(temp_path):
    with _document_converter_lock:
        result = _get_document_converter().convert(str(temp_path))
    return result.document.export_to_text()


def extract_pdf_text_ocr(url):
    """Download and extract a PDF, reusing cached text when its content is unchanged.

    The public signature and returned plain-text value remain compatible with the
    ingestion pipeline. Cache validators avoid downloading unchanged documents when
    the origin supports conditional requests; content hashes avoid repeat conversion
    when it does not.
    """
    cache_path = _cache_paths(url)
    # Prevent duplicate downloads/conversions for the same URL among bounded workers.
    with _lock_for_url(url):
        cache = _read_cache(cache_path)
        temp_path = None
        try:
            temp_path, downloaded = _download_pdf(url, cache)
            if temp_path is None:
                return cache["text"]

            if cache and downloaded["sha256"] == cache["sha256"]:
                return cache["text"]

            text = _convert_pdf(temp_path)
            _write_cache(cache_path, {
                "cache_version": PDF_CACHE_VERSION,
                **downloaded,
                "text": text,
            })
            return text
        finally:
            if temp_path and temp_path.exists():
                temp_path.unlink()


def _extract_one_pdf(title, url):
    try:
        print(f"Extracting PDF: {title}")
        text = extract_pdf_text_ocr(url)
        if _has_meaningful_text(text):
            return title, text, None
        return title, None, "No meaningful text extracted"
    except Exception as error:
        return title, None, str(error)


def extract_scholarship_pdfs(pdf_links):
    extracted_documents = []
    successful_documents = []
    failed_documents = {}
    documents = list(pdf_links.items())

    # Downloads may overlap, but Docling conversions stay protected by the existing
    # lock. The worker bound prevents unbounded sockets and temporary files.
    with ThreadPoolExecutor(max_workers=min(PDF_MAX_WORKERS, max(1, len(documents)))) as pool:
        results = list(pool.map(lambda item: _extract_one_pdf(*item), documents))

    # Executor.map preserves input order, keeping the combined text deterministic.
    for title, text, error in results:
        if error:
            if error == "No meaningful text extracted":
                print(f"No text extracted from: {title}")
            else:
                print(f"Failed to extract {title}: {error}")
            failed_documents[title] = error
        else:
            extracted_documents.append(f"--- Document: {title} ---\n{text}")
            successful_documents.append(title)

    return PdfExtractionResult(
        text="\n\n".join(extracted_documents),
        successful_documents=successful_documents,
        failed_documents=failed_documents,
    )
