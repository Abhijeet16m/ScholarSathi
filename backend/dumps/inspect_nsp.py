
import requests

url = "https://scholarships.gov.in/"

response = requests.get(
    url,
    timeout=20,
    headers={"User-Agent": "ScholarSathi/1.0"}
)

print("Status:", response.status_code)
print("Content type:", response.headers.get("Content-Type"))
print("HTML length:", len(response.text))
print(response.text[:500])
