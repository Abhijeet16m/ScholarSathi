from bs4 import BeautifulSoup

def scrape_nsp_cards(html):
    soup = BeautifulSoup(html, "html.parser")
    scholarships = []

    for card in soup.select(".col-md-10"):
        title = card.find("h6")
        if not title:
            continue

        info = [span.get_text(" ", strip=True) for span in card.find_all("span")]

        pdfs = {
            link.get_text(" ", strip=True): link.get("href")
            for link in card.find_all("a", href=True)
        }

        scholarships.append({
            "title": title.get_text(" ", strip=True),
            "brief_info": info,
            "pdf_links": pdfs
        })

    return scholarships

