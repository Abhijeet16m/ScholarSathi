from dataclasses import dataclass
import os
import requests
import tempfile
import threading
from docling.document_converter import DocumentConverter


# Docling initializes and caches its PDF pipeline on the converter. Reuse one
# converter across PDFs instead of repeating that setup for every document.
_document_converter = None
_document_converter_lock = threading.RLock()


def _get_document_converter():
    global _document_converter
    with _document_converter_lock:
        if _document_converter is None:
            _document_converter = DocumentConverter()
        return _document_converter


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


def extract_pdf_text_ocr(url):
    response = requests.get(
        url,
        headers={"User-Agent": "ScholarSathi/1.0"},
        timeout=60
    )
    response.raise_for_status()

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as pdf_file:
            temp_path = pdf_file.name
            pdf_file.write(response.content)

        # Keep the shared Docling converter safe if independent callers overlap.
        with _document_converter_lock:
            result = _get_document_converter().convert(temp_path)
        return result.document.export_to_text()
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)


def extract_scholarship_pdfs(pdf_links):
    extracted_documents = []
    successful_documents = []
    failed_documents = {}

    for title, url in pdf_links.items():
        try:
            print(f"Extracting PDF: {title}")

            text = extract_pdf_text_ocr(url)

            if _has_meaningful_text(text):
                extracted_documents.append(
                    f"--- Document: {title} ---\n{text}"
                )
                successful_documents.append(title)
            else:
                print(f"No text extracted from: {title}")
                failed_documents[title] = "No meaningful text extracted"

        except Exception as error:
            print(f"Failed to extract {title}: {error}")
            failed_documents[title] = str(error)

    return PdfExtractionResult(
        text="\n\n".join(extracted_documents),
        successful_documents=successful_documents,
        failed_documents=failed_documents,
    )
