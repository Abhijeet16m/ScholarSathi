from Scrapper import fetch_html
from webScrap.nsp import scrape_nsp_cards
from utils import extract_scholarship_pdfs
from llm import extract_scholarship_info
from db import upsert_scholarship


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
    html = fetch_html(portal["url"])

    # Extract scholarship listings using that portal's scraper.
    scholarships = portal["scraper"](html)

    print(f"Found {len(scholarships)} scholarships")

    for index, scholarship in enumerate(scholarships, start=1):
        try:
            title = scholarship.get("title")

            if not title:
                raise ValueError("Scholarship title is missing")

            print(f"\n[{index}/{len(scholarships)}] {title}")
        except Exception as error:
            print(f"Failed to process scholarship: {error}")
            continue

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
            scholarship_id = upsert_scholarship(
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
