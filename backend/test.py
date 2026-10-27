from Scrapper import fetch_html
from Scrapper import clean_html, split_repeated_elements


url = "https://scholarships.gov.in/All-Scholarships"
html = fetch_html(url)
cleaned = clean_html(html)
groups = split_repeated_elements(cleaned)

for pattern, elements in groups.items():
    print(pattern, len(elements))
with open("dump.txt", "w") as f:
    f.write(cleaned)
