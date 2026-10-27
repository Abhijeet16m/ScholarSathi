from google import genai
import os
from dotenv import load_dotenv
import requests
from bs4 import BeautifulSoup

load_dotenv()
key = os.environ.get("GEMINI_API_KEY")

site = "https://scholarships.gov.in/All-Scholarships"
page = requests.get(site).text
soup = BeautifulSoup(page, 'html.parser')

client = genai.Client(api_key=key)

response = client.models.generate_content(
    model="gemini-3.8-flash",
    contents=f"Look into this HTML Page and find for common class-Name or attribute in all scholarships\nNote: Give your response in json format\nHTML Page:\n{soup}"
)

print(response.text)