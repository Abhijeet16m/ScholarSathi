import psycopg2
import os
from datetime import date, datetime
from decimal import Decimal
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


def get_student_profile(student_id):
    """Read eligibility fields only; never return account credentials/contact data."""
    fields = (
        "id", "date_of_birth", "gender", "category", "domicile_state",
        "annual_family_income", "qualification_level", "qualification_marks",
        "course_level", "course_name", "course_year", "entrance_exam_rank",
        "institution_name", "has_disability", "is_orphan", "parent_occupation",
        "receives_other_scholarship", "district",
    )
    conn = get_db_connection()
    cursor = None
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT " + ", ".join(fields) +
            " FROM public.students WHERE id = %s",
            (student_id,),
        )
        row = cursor.fetchone()
        if row is None:
            raise ValueError(f"Student with ID {student_id} does not exist")

        profile = dict(zip(fields, row))
        for key, value in profile.items():
            if isinstance(value, (date, datetime)):
                profile[key] = value.isoformat()
            elif isinstance(value, Decimal):
                profile[key] = (
                    int(value) if value == value.to_integral_value()
                    else float(value)
                )
        return profile
    finally:
        try:
            if cursor is not None:
                cursor.close()
        finally:
            conn.close()


def get_student_scholarships(student_id: int) -> dict:
    """Return a JSON-compatible eligibility report for one student.

    Scholarship eligibility is calculated only by the existing SQL matching
    function. This wrapper fetches safe student fields and scholarship details,
    then groups the SQL results without introducing comparison rules.
    """
    get_student_profile(student_id)  # Validate student existence; do not return PII.
    matches = get_scholarship_matches(student_id)

    scholarship_ids = [
        row.get("scholarship_id") for row in matches
        if row.get("scholarship_id") is not None
    ]
    full_details = {}
    if scholarship_ids:
        conn = get_db_connection()
        cursor = None
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM public.scholarships WHERE id = ANY(%s)",
                (scholarship_ids,),
            )
            columns = [description[0] for description in cursor.description]

            def to_json_value(value):
                if isinstance(value, (date, datetime)):
                    return value.isoformat()
                if isinstance(value, Decimal):
                    return (
                        int(value) if value == value.to_integral_value()
                        else float(value)
                    )
                if isinstance(value, dict):
                    return {key: to_json_value(item) for key, item in value.items()}
                if isinstance(value, (list, tuple, set)):
                    return [to_json_value(item) for item in value]
                return value

            for row in cursor.fetchall():
                detail = to_json_value(dict(zip(columns, row)))
                full_details[detail.get("id")] = detail
        finally:
            try:
                if cursor is not None:
                    cursor.close()
            finally:
                conn.close()

    scholarships = []
    counts = {"eligible": 0, "not_eligible": 0, "needs_verification": 0}
    for match in matches:
        status = str(match.get("eligibility_status") or "").strip().casefold()
        if status == "eligible":
            group = "eligible"
        elif status in {"not eligible", "not_eligible", "ineligible"}:
            group = "not_eligible"
        else:
            # Includes explicit verification/unknown statuses and missing status.
            group = "needs_verification"
        counts[group] += 1

        details = full_details.get(match.get("scholarship_id"), {})
        scholarships.append({
            "scholarship_id": match.get("scholarship_id"),
            "name": match.get("scholarship_name") or details.get("name"),
            "scholarship_status": (
                match.get("scholarship_status") or details.get("status")
            ),
            "eligibility_status": match.get("eligibility_status"),
            # These columns are counts in compare/sql; preserve their DB values.
            "matched_conditions": match.get("matched_conditions"),
            "failed_conditions": match.get("failed_conditions"),
            "unknown_conditions": match.get("unknown_conditions"),
            "ignored_conditions": match.get("ignored_conditions"),
            "applicable_conditions": match.get("applicable_conditions"),
            "failed_reasons": match.get("failed_reasons") or [],
            "verification_reasons": match.get("verification_reasons") or [],
            "details": details,
        })

    return {
        "student_id": student_id,
        "summary": {
            "total_evaluated": len(scholarships),
            **counts,
        },
        "scholarships": scholarships,
    }

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
