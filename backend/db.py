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
        ON CONFLICT (name, provider)
        DO UPDATE SET
            description = COALESCE(EXCLUDED.description, scholarships.description),
            application_url = EXCLUDED.application_url,
            official_pdf_urls = EXCLUDED.official_pdf_urls,
            application_open_date = EXCLUDED.application_open_date,
            deadline = EXCLUDED.deadline,
            status = EXCLUDED.status,
            max_family_income = EXCLUDED.max_family_income,
            min_qualification_level = EXCLUDED.min_qualification_level,
            min_qualification_marks = EXCLUDED.min_qualification_marks,
            required_course_level = EXCLUDED.required_course_level,
            eligible_courses = EXCLUDED.eligible_courses,
            eligible_course_years = EXCLUDED.eligible_course_years,
            min_entrance_rank = EXCLUDED.min_entrance_rank,
            min_age = EXCLUDED.min_age,
            max_age = EXCLUDED.max_age,
            eligible_genders = EXCLUDED.eligible_genders,
            eligible_categories = EXCLUDED.eligible_categories,
            eligible_domiciles = EXCLUDED.eligible_domiciles,
            eligible_institutions = EXCLUDED.eligible_institutions,
            requires_disability = EXCLUDED.requires_disability,
            requires_orphan_status = EXCLUDED.requires_orphan_status,
            eligible_parent_occupations = EXCLUDED.eligible_parent_occupations,
            allows_other_scholarships = EXCLUDED.allows_other_scholarships,
            scholarship_amount = EXCLUDED.scholarship_amount,
            benefit_duration_months = EXCLUDED.benefit_duration_months,
            rules_verified_at = NOW(),
            updated_at = NOW()
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
            return cur.fetchone()[0]
