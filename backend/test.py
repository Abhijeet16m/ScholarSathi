from webScrap.nsp import scrape_nsp_cards
from Scrapper import fetch_html

html = fetch_html("https://scholarships.gov.in/All-Scholarships")
print("HTML length:", len(html))

data = scrape_nsp_cards(html)
print("Scholarships found:", len(data))
print(data[:])