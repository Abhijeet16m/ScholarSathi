from db import DATABASE_URL
from llm import client
import psycopg2

def test_gemini_connection():
    response = client.models.generate_content(
        model="gemini-3.5-flash-lite",
        contents='Reply with exactly: "Gemini is working!"'
    )
    print("Gemini response:", response.text)

def test_db_connection():
    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT version();")
            print("Database connected!")
            print(cur.fetchone()[0])


if __name__ == "__main__":
    test_gemini_connection()
    test_db_connection()