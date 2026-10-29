import requests
from bs4 import BeautifulSoup, Comment
from collections import defaultdict

def split_repeated_elements(html, min_repeats=2):
    soup = BeautifulSoup(html, "html.parser")
    groups = defaultdict(list)

    for tag in soup.find_all(True):
        classes = tuple(sorted(tag.get("class", [])))
        key = (tag.name, classes)

        if classes:
            groups[key].append(tag)

    repeated = {}

    for (tag_name, classes), elements in groups.items():
        # Keep only the outermost matching elements
        unique = []
        for element in elements:
            if not any(parent in unique for parent in element.parents):
                unique.append(element)

        if len(unique) >= min_repeats:
            key = tag_name + "." + ".".join(classes)
            repeated[key] = [str(el) for el in unique]

    return repeated


def clean_html(html):
    soup = BeautifulSoup(html, "html.parser")

    # Remove unnecessary elements and their contents
    for tag in soup([
        "script", "style", "head", "footer", "nav",
        "header", "noscript", "iframe", "svg", "canvas",
        "video", "audio", "form", "button"
    ]):
        tag.decompose()

    # Remove HTML comments
    for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
        comment.extract()

    # Keep the main content if available
    main = soup.find("main") or soup.find("article")
    if main:
        soup = BeautifulSoup(str(main), "html.parser")

    # Remove unnecessary attributes
    for tag in soup.find_all(True):
        tag.attrs = {
            key: value
            for key, value in tag.attrs.items()
            if key in ("href", "src", "alt", "title")
        }

    return str(soup)


def fetch_html(url):
    response = requests.get(
        url,
        headers={"User-Agent": "ScholarSathi/1.0"},
        timeout=20
    )
    response.raise_for_status()
    return response.text


def prepare_html_for_ai(url, output_file="cleaned.html"):
    html = fetch_html(url)
    cleaned_html = clean_html(html)

    with open(output_file, "w", encoding="utf-8") as file:
        file.write(cleaned_html)

    print(f"Cleaned HTML saved to {output_file}")
    print(f"Original size: {len(html):,} characters")
    print(f"Cleaned size: {len(cleaned_html):,} characters")

    return cleaned_html
    