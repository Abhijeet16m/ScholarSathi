import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def get_db_connection():
    return psycopg2.connect(
        os.getenv("DATABASE_URL")
    )

def get_scholarship_matches(student_id):

    conn = get_db_connection()
    cursor = None

    try:
        cursor = conn.cursor()

        cursor.execute(
            "SELECT * FROM public.match_scholarships(%s)",
            (student_id,)
        )
        
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()

        return [
            dict(zip(columns, row))
            for row in rows
        ]

    finally:
        if cursor:
            cursor.close()
        conn.close()

if __name__ == "__main__":

    student_id = 4

    try:
        matches = get_scholarship_matches(student_id)

        print(f"\nTotal scholarships: {len(matches)}")

        for scholarship in matches:
            print("\n---------------------------")
            print("Scholarship:", scholarship["scholarship_name"])
            print("Status:", scholarship["eligibility_status"])
            print("Matched:", scholarship["matched_conditions"])
            print("Failed:", scholarship["failed_conditions"])
            print("Unknown:", scholarship["unknown_conditions"])

    except Exception as e:
        print("Error:", e)