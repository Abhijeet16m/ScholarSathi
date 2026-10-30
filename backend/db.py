import os
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import Json

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")


def add_scholarship(data):
    query = """
        INSERT INTO scholarships (
            name, provider, description, application_url,
            official_pdf_urls, application_open_date, deadline, status,
            max_family_income, min_qualification_level,
            min_qualification_marks, required_course_level,
            eligible_courses, eligible_course_years, min_entrance_rank,
            min_age, max_age, eligible_genders, eligible_categories,
            eligible_domiciles, eligible_institutions,
            requires_disability, requires_orphan_status,
            eligible_parent_occupations, allows_other_scholarships,
            scholarship_amount, benefit_duration_months,
            rules_verified_at, updated_at
        )
        VALUES (
            %(name)s, %(provider)s, %(description)s, %(application_url)s,
            %(official_pdf_urls)s, %(application_open_date)s, %(deadline)s,
            %(status)s, %(max_family_income)s, %(min_qualification_level)s,
            %(min_qualification_marks)s, %(required_course_level)s,
            %(eligible_courses)s, %(eligible_course_years)s,
            %(min_entrance_rank)s, %(min_age)s, %(max_age)s,
            %(eligible_genders)s, %(eligible_categories)s,
            %(eligible_domiciles)s, %(eligible_institutions)s,
            %(requires_disability)s, %(requires_orphan_status)s,
            %(eligible_parent_occupations)s, %(allows_other_scholarships)s,
            %(scholarship_amount)s, %(benefit_duration_months)s,
            NOW(), NOW()
        )
        RETURNING id;
    """

    defaults = {
        "provider": None,
        "description": None,
        "application_url": None,
        "official_pdf_urls": Json([]),
        "application_open_date": None,
        "deadline": None,
        "status": "active",
        "max_family_income": None,
        "min_qualification_level": None,
        "min_qualification_marks": None,
        "required_course_level": None,
        "eligible_courses": None,
        "eligible_course_years": None,
        "min_entrance_rank": None,
        "min_age": None,
        "max_age": None,
        "eligible_genders": None,
        "eligible_categories": None,
        "eligible_domiciles": None,
        "eligible_institutions": None,
        "requires_disability": None,
        "requires_orphan_status": None,
        "eligible_parent_occupations": None,
        "allows_other_scholarships": None,
        "scholarship_amount": None,
        "benefit_duration_months": None,
    }

    values = {**defaults, **data}

    if not values.get("name"):
        raise ValueError("Scholarship name is required")

    if isinstance(values["official_pdf_urls"], (dict, list)):
        values["official_pdf_urls"] = Json(values["official_pdf_urls"])

    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(query, values)
            scholarship_id = cur.fetchone()[0]

    return scholarship_id


def upsert_scholarship(data):
    columns = [
        "name", "provider", "description", "application_url",
        "official_pdf_urls", "application_open_date", "deadline", "status",
        "max_family_income", "min_qualification_level",
        "min_qualification_marks", "required_course_level",
        "eligible_courses", "eligible_course_years", "min_entrance_rank",
        "min_age", "max_age", "eligible_genders", "eligible_categories",
        "eligible_domiciles", "eligible_institutions",
        "requires_disability", "requires_orphan_status",
        "eligible_parent_occupations", "allows_other_scholarships",
        "scholarship_amount", "benefit_duration_months",
    ]

    defaults = {
        "provider": None,
        "description": None,
        "application_url": None,
        "official_pdf_urls": None,
        "application_open_date": None,
        "deadline": None,
        "status": None,
        "max_family_income": None,
        "min_qualification_level": None,
        "min_qualification_marks": None,
        "required_course_level": None,
        "eligible_courses": None,
        "eligible_course_years": None,
        "min_entrance_rank": None,
        "min_age": None,
        "max_age": None,
        "eligible_genders": None,
        "eligible_categories": None,
        "eligible_domiciles": None,
        "eligible_institutions": None,
        "requires_disability": None,
        "requires_orphan_status": None,
        "eligible_parent_occupations": None,
        "allows_other_scholarships": None,
        "scholarship_amount": None,
        "benefit_duration_months": None,
    }

    values = {**defaults, **data}

    if not values.get("name"):
        raise ValueError("Scholarship name is required")

    # Empty collections are treated as missing information.
    for field in columns:
        value = values.get(field)
        if isinstance(value, (list, dict)) and not value:
            values[field] = None

    # Preserve an existing status when no status was supplied.
    if not data.get("status"):
        values["status"] = "active" 

    values["official_pdf_urls"] = (
        Json(values["official_pdf_urls"])
        if values["official_pdf_urls"] is not None
        else None
    )

    insert_columns = ", ".join(columns)
    placeholders = ", ".join(f"%({column})s" for column in columns)

    update_fields = [
        column for column in columns
        if column not in ("name", "provider")
    ]

    assignments = ",\n".join(
        f"{column} = COALESCE(EXCLUDED.{column}, scholarships.{column})"
        for column in update_fields
    )

    query = f"""
        INSERT INTO scholarships ({insert_columns}, rules_verified_at, updated_at)
        VALUES ({placeholders}, NOW(), NOW())
        ON CONFLICT (name, provider)
        DO UPDATE SET
            {assignments},
            rules_verified_at = NOW(),
            updated_at = NOW()
        RETURNING id;
    """

    with psycopg2.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(query, values)
            return cur.fetchone()[0]
