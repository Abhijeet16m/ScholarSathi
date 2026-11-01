import hmac
import os

import psycopg2
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Path
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
            """SELECT m.*, scholarship.provider, scholarship.application_url,
                      scholarship.deadline, scholarship.scholarship_amount
               FROM public.match_scholarships(%s::bigint) AS m
               LEFT JOIN public.scholarships AS scholarship
                 ON scholarship.id = m.scholarship_id
               ORDER BY CASE m.eligibility_status
                 WHEN 'Eligible' THEN 0
                 WHEN 'Needs Verification' THEN 1
                 ELSE 2
               END, m.matched_conditions DESC, m.scholarship_id""",
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
def scholarship_matches(
    student_id: int = Path(gt=0),
    internal_api_key: str | None = Header(default=None, alias="X-Internal-Api-Key"),
):
    """Serve eligibility data to the authenticated Express gateway only."""
    configured_key = os.getenv("INTERNAL_API_KEY")
    if not configured_key or len(configured_key) < 32:
        raise HTTPException(
            status_code=503,
            detail="Internal API authentication is not configured.",
        )
    if not internal_api_key or not hmac.compare_digest(internal_api_key, configured_key):
        raise HTTPException(status_code=401, detail="Unauthorized.")

    try:
        matches = get_scholarship_matches(student_id)
        return jsonable_encoder({"matches": matches})
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
