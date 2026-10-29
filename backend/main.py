
from pathlib import Path

from Scrapper import prepare_html_for_ai
from webScrap.nsp import scrape_nsp_cards
from utils import extract_pdf_text_ocr
from utils import extract_scholarship_pdfs
from llm import extract_scholarship_info
from db import add_scholarship


# Each portal has its own scraper module and URL.
PORTALS = [
    {
        "name": "NSP",
        "url": "https://scholarships.gov.in/All-Scholarships",
        "scraper": scrape_nsp_cards,
    },
]


def process_portal(portal):
    print(f"\nProcessing portal: {portal['name']}")

    # Fetch and clean the portal HTML.
    cleaned_html = prepare_html_for_ai(portal["url"])

    # Extract scholarship listings using that portal's scraper.
    scholarships = portal["scraper"](cleaned_html)
    print(f"Found {len(scholarships)} scholarships")

    for index, scholarship in enumerate(scholarships, start=1):
        print(f"\n[{index}/{len(scholarships)}] {scholarship['title']}")

        try:
            # TODO: Implement this function later.
            pdf_text = extract_scholarship_pdfs(
                scholarship["pdf_links"]
            )

            # Extract structured scholarship data with Gemini.
            extracted_data = extract_scholarship_info(
                scholarship,
                pdf_text
            )

            # Insert into PostgreSQL.
            scholarship_id = add_scholarship(
                extracted_data.model_dump()
            )

            print(f"Saved scholarship ID: {scholarship_id}")

        except Exception as error:
            print(f"Failed to process scholarship: {error}")


def main():
    for portal in PORTALS:
        process_portal(portal)


if __name__ == "__main__":
    main()
