import requests
from io import BytesIO
from docling.document_converter import DocumentConverter

def extract_pdf_text_ocr(url):
    response = requests.get(
        url,
        headers={"User-Agent": "ScholarSathi/1.0"},
        timeout=60
    )
    response.raise_for_status()

    pdf_bytes = BytesIO(response.content)

    with open("temp_scholarship.pdf", "wb") as f:
        f.write(pdf_bytes.getvalue())

    converter = DocumentConverter()
    result = converter.convert("temp_scholarship.pdf")

    return result.document.export_to_text()


def extract_scholarship_pdfs(pdf_links):
    extracted_documents = []

    for title, url in pdf_links.items():
        try:
            print(f"Extracting PDF: {title}")

            text = extract_pdf_text_ocr(url)

            if text.strip():
                extracted_documents.append(
                    f"--- Document: {title} ---\n{text}"
                )
            else:
                print(f"No text extracted from: {title}")

        except Exception as error:
            print(f"Failed to extract {title}: {error}")

    return "\n\n".join(extracted_documents)
