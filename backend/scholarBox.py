import requests
import os
from dotenv import load_dotenv
import json
import psycopg2
from google import genai
from google.genai import types
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


load_dotenv()

API_URL = os.getenv("API_URL")
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def get_db_connection():
    return psycopg2.connect(os.getenv("DATABASE_URL"))


def fetch_all_scholarships() -> list:
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
    })

    params = {
        "limit": 10,
        "search": "",
        "filter": "latest",
        "scholarshipType": "",
        "cmpnyId": ""
    }

    scholarships = []
    seen = set()
    page = 1
    cursor = None

    while True:
        request_params = params.copy()
        if cursor:
            request_params["cursor"] = cursor
        else:
            request_params["page"] = page

        retry_strategy = Retry(
            total=4,
            backoff_factor=2,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET"]
        )

        session.mount("https://", HTTPAdapter(max_retries=retry_strategy))

        response = session.get(
            API_URL,
            params=request_params,
            timeout=(15, 60)
        )
        response.raise_for_status()
        payload = response.json()

        data = payload.get("data", {})
        records = data.get("Scholarships", [])

        if not records:
            break

        for item in records:
            key = str(item.get("id") or item)
            if key not in seen:
                seen.add(key)
                scholarships.append(item)

        if data.get("hasMore") is False:
            break

        next_cursor = data.get("nextCursor")
        if next_cursor:
            if next_cursor == cursor:
                break
            cursor = next_cursor
        elif data.get("totalPages") is not None:
            if int(data.get("currentPage", page)) >= int(data["totalPages"]):
                break
            page += 1
        elif data.get("hasMore") is True:
            page += 1
        else:
            break

    return scholarships

def extract_unknown_fields(prompt: str) -> dict:
    response = client.models.generate_content(
        model="gemini-3.5-flash-lite",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json"
        )
    )

    return json.loads(response.text)


def update_scholarship(scholarship, conn):
    cursor = conn.cursor()

    external_id = scholarship.get("_id")
    company = scholarship.get("thirdPartyCompany") or {}

    # Fields directly available in API response
    known_fields = {
        "external_id": external_id,
        "name": scholarship.get("title"),
        "provider": company.get("companyName"),
        "description": scholarship.get("aboutScholarship"),
        "application_url": scholarship.get("externalApplyLink") or None,
        "deadline": scholarship.get("dueDate"),
        "application_url": (
            scholarship.get("externalApplyLink")
            or scholarship.get("thirdPartyCompany", {}).get("websiteLink")
            or None
        ),
        "status": (
            "closed" if scholarship.get("isExpire")
            else "active" if scholarship.get("isPublish")
            else "inactive"
        )
    }

    try:
        # Insert known fields
        columns = ", ".join(known_fields.keys())
        placeholders = ", ".join(["%s"] * len(known_fields))

        cursor.execute(
            f"""
            INSERT INTO scholarships ({columns})
            VALUES ({placeholders})
            RETURNING id
            """,
            tuple(known_fields.values())
        )

        db_id = cursor.fetchone()[0]

        prompt = f"""
            Extract scholarship information for the following scholarship.

            SCHOLARSHIP DATA:
            {json.dumps(scholarship, ensure_ascii=False)}

            Return ONLY valid JSON using these exact database field names:

            {{
                "official_pdf_urls": [],
                "application_open_date": null,
                "max_family_income": null,
                "min_qualification_level": null,
                "min_qualification_marks": null,
                "required_course_level": null,
                "eligible_courses": [],
                "eligible_course_years": [],
                "min_entrance_rank": null,
                "min_age": null,
                "max_age": null,
                "eligible_genders": [],
                "eligible_categories": [],
                "eligible_domiciles": [],
                "eligible_institutions": [],
                "requires_disability": null,
                "requires_orphan_status": null,
                "eligible_parent_occupations": [],
                "allows_other_scholarships": null,
                "scholarship_amount": null,
                "benefit_duration_months": null
            }}

            STRICT TYPE RULES:

            1. NUMERIC FIELDS:
            - max_family_income: number or null
            - min_qualification_marks: number or null
            - min_entrance_rank: integer or null
            - min_age: integer or null
            - max_age: integer or null
            - scholarship_amount: number or null
            - benefit_duration_months: integer or null
            - NEVER include explanations, units, or text in numeric fields.
            - Example: "Minimum GPA of 6.0 on a 7.0 scale" means 6.0.

            2. BOOLEAN FIELDS:
            - requires_disability, requires_orphan_status,
            allows_other_scholarships: true, false, or null.

            3. ARRAY FIELDS:
            - Always return arrays of strings or integers according to the field type.
            - Never return a single string instead of an array.

            4. DATE:
            - application_open_date must use YYYY-MM-DD or null.

            5. UNKNOWN VALUES:
            - Use null for unknown scalar values.
            - Use [] for unknown array values.
            - Never guess or invent eligibility criteria.

            6. IMPORTANT:
            - Extract only information explicitly supported by the supplied data.
            - Distinguish minimum marks from GPA scales and percentages.
            - Preserve the actual numeric score; do not convert between grading scales.
            - Do not confuse scholarship amount with tuition fee percentage.

            Return JSON only. No Markdown or explanations.
            """

        unknown_fields = extract_unknown_fields(prompt)

        # Only allow valid scholarship columns
        allowed_fields = {
            "official_pdf_urls", "application_open_date",
            "max_family_income", "min_qualification_level",
            "min_qualification_marks", "required_course_level",
            "eligible_courses", "eligible_course_years",
            "min_entrance_rank", "min_age", "max_age",
            "eligible_genders", "eligible_categories",
            "eligible_domiciles", "eligible_institutions",
            "requires_disability", "requires_orphan_status",
            "eligible_parent_occupations",
            "allows_other_scholarships", "scholarship_amount",
            "benefit_duration_months", "rules_verified_at"
        }

        unknown_fields = {
            key: value
            for key, value in unknown_fields.items()
            if key in allowed_fields
        }

        if unknown_fields:
            assignments = ", ".join(
                f"{key} = %s" for key in unknown_fields
            )

            cursor.execute(
                f"""
                UPDATE scholarships
                SET {assignments}, updated_at = NOW()
                WHERE id = %s
                """,
                (*unknown_fields.values(), db_id)
            )

        return db_id

    finally:
        cursor.close()


def sync_scholarships(scholarships):
        conn = get_db_connection()
        cursor = conn.cursor()

        try:
            count = 1
            for scholarship in scholarships:
                print(f"Processing scholarship {count}/{len(scholarships)}")
                count += 1
                external_id = scholarship.get("_id")

                cursor.execute(
                    "SELECT 1 FROM scholarships WHERE external_id = %s",
                    (external_id,)
                )

                if cursor.fetchone():
                    continue

                update_scholarship(scholarship, conn)

            conn.commit()

        except Exception:
            conn.rollback()
            raise

        finally:
            cursor.close()
            conn.close()

def remove_missing_scholarships(scholarships, conn):
    cursor = conn.cursor()

    try:
        api_ids = [s.get("_id") for s in scholarships if s.get("_id")]

        cursor.execute(
            """
            DELETE FROM scholarships
            WHERE external_id <> ALL(%s)
            RETURNING external_id
            """,
            (api_ids,)
        )

        deleted_ids = cursor.fetchall()
        conn.commit()

        return len(deleted_ids)

    except Exception:
        conn.rollback()
        raise

    finally:
        cursor.close()


def main():
    scholarships = fetch_all_scholarships()

    if not scholarships:
        print("No scholarships fetched. Database unchanged.")
        return

    print(f"Total fetched: {len(scholarships)}")

    sync_scholarships(scholarships)

    conn = get_db_connection()
    # try:
        # deleted = remove_missing_scholarships(scholarships, conn)
        # print(f"Deleted: {deleted}")
    # finally:
    conn.close()

    print("Scholarship table sync completed.")



if __name__ == "__main__":
    main()