import os

import psycopg2
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder

load_dotenv()

app = FastAPI(title="ScholarSathi API")


def get_db_connection():
    return psycopg2.connect(os.getenv("DATABASE_URL"))


def get_scholarship_matches(student_id):
    conn = get_db_connection()
    cursor = None

    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM public.match_scholarships(%s)",
            (student_id,),
        )
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        return [dict(zip(columns, row)) for row in rows]
    finally:
        if cursor:
            cursor.close()
        conn.close()


@app.get("/api/students/{student_id}/scholarship-matches")
def scholarship_matches(student_id: int):
    """Return all matching scholarship rows from the existing SQL function."""
    try:
        matches = get_scholarship_matches(student_id)
        return jsonable_encoder(matches)
    except Exception as error:
        # Keep connection strings, SQL details, and driver errors out of responses.
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve scholarship matches.",
        ) from error


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
    except Exception as error:
        print("Error:", error)
