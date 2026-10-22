"""Transactional PostgreSQL storage for scraped scholarship records."""

import os
from contextlib import contextmanager
from typing import Any, Iterator, Mapping

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


class ScholarshipRepositoryError(RuntimeError):
    """Raised when scholarship persistence cannot be completed."""


@contextmanager
def _connection_scope(connection=None) -> Iterator[Any]:
    if connection is not None:
        yield connection
        return

    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ScholarshipRepositoryError(
            "DATABASE_URL is not set; add it to the environment or backend .env"
        )
    with psycopg.connect(database_url) as opened_connection:
        yield opened_connection


def get_content_hash(
    source_portal: str,
    source_url: str,
    *,
    connection=None,
) -> str | None:
    """Read the last successfully persisted hash for one source identity."""
    query = """
        SELECT content_hash
        FROM public.scholarships
        WHERE source_portal = %s AND source_url = %s
    """
    with _connection_scope(connection) as conn:
        with conn.cursor(row_factory=dict_row) as cursor:
            cursor.execute(query, (source_portal, source_url))
            row = cursor.fetchone()
            return row["content_hash"] if row else None


def upsert_scholarship_with_rules(
    scholarship: Mapping[str, Any],
    eligibility: Mapping[str, Any],
    content_hash: str,
    *,
    connection=None,
) -> int:
    """Atomically upsert a scholarship and its one-to-one eligibility row."""
    required_scholarship = {
        "source_portal",
        "source_url",
        "name",
        "provider",
        "description",
        "application_url",
        "deadline",
        "official_pdf_urls",
    }
    if not required_scholarship.issubset(scholarship):
        raise ValueError("scholarship record is missing required fields")
    if not scholarship["source_portal"] or not scholarship["source_url"]:
        raise ValueError("source_portal and source_url are required for an upsert")
    if not isinstance(content_hash, str) or not content_hash:
        raise ValueError("content_hash must be a non-empty string")

    fact_fields = {
        "max_family_income": "max_annual_family_income",
        "min_marks_percentage": "min_marks_percentage",
        "eligible_courses": "eligible_courses",
        "eligible_categories": "eligible_categories",
        "eligible_genders": "eligible_genders",
        "eligible_domiciles": "eligible_domicile_states",
        "other_rules": "other_conditions",
    }
    eligibility_row = {}
    for column, field in fact_fields.items():
        fact = eligibility.get(field)
        eligibility_row[column] = fact.get("value") if isinstance(fact, Mapping) else None
    eligibility_row["evidence"] = {
        "source_document_url": eligibility.get("source_document_url"),
        "facts": {
            field: eligibility.get(field, {}).get("evidence", [])
        for field in fact_fields.values()
        if isinstance(eligibility.get(field), Mapping)
        },
    }
    eligibility_row["other_rules"] = {
        "conditions": eligibility_row["other_rules"]
    }

    scholarship_query = """
        INSERT INTO public.scholarships (
            source_portal, source_url, content_hash, name, provider, description,
            application_url, deadline, official_pdf_urls, updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, now())
        ON CONFLICT (source_portal, source_url)
            WHERE source_portal IS NOT NULL AND source_url IS NOT NULL
        DO UPDATE SET
            content_hash = EXCLUDED.content_hash,
            name = EXCLUDED.name,
            provider = COALESCE(EXCLUDED.provider, scholarships.provider),
            description = EXCLUDED.description,
            application_url = COALESCE(EXCLUDED.application_url, scholarships.application_url),
            deadline = COALESCE(EXCLUDED.deadline, scholarships.deadline),
            official_pdf_urls = EXCLUDED.official_pdf_urls,
            updated_at = now()
        RETURNING id
    """
    eligibility_query = """
        INSERT INTO public.eligibility_rules (
            scholarship_id, max_family_income, min_marks_percentage,
            eligible_courses, eligible_categories, eligible_genders,
            eligible_domiciles, other_rules, evidence, rules_verified_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, now())
        ON CONFLICT (scholarship_id) DO UPDATE SET
            max_family_income = EXCLUDED.max_family_income,
            min_marks_percentage = EXCLUDED.min_marks_percentage,
            eligible_courses = EXCLUDED.eligible_courses,
            eligible_categories = EXCLUDED.eligible_categories,
            eligible_genders = EXCLUDED.eligible_genders,
            eligible_domiciles = EXCLUDED.eligible_domiciles,
            other_rules = EXCLUDED.other_rules,
            evidence = EXCLUDED.evidence,
            rules_verified_at = now()
    """
    scholarship_params = (
        scholarship["source_portal"],
        scholarship["source_url"],
        content_hash,
        scholarship["name"],
        scholarship["provider"],
        scholarship["description"],
        scholarship["application_url"],
        scholarship["deadline"],
        Jsonb(scholarship["official_pdf_urls"]),
    )
    jsonb_columns = {
        "eligible_courses",
        "eligible_categories",
        "eligible_genders",
        "eligible_domiciles",
    }
    eligibility_params_template = tuple(
        Jsonb(eligibility_row[column])
        if column in jsonb_columns and eligibility_row[column] is not None
        else eligibility_row[column]
        for column in (
            "max_family_income",
            "min_marks_percentage",
            "eligible_courses",
            "eligible_categories",
            "eligible_genders",
            "eligible_domiciles",
        )
    ) + (Jsonb(eligibility_row["other_rules"]), Jsonb(eligibility_row["evidence"]))

    with _connection_scope(connection) as conn:
        try:
            with conn.transaction():
                with conn.cursor(row_factory=dict_row) as cursor:
                    cursor.execute(scholarship_query, scholarship_params)
                    row = cursor.fetchone()
                    if not row or row.get("id") is None:
                        raise ScholarshipRepositoryError(
                            "Scholarship upsert returned no database identity"
                        )
                    scholarship_id = row["id"]
                    cursor.execute(
                        eligibility_query,
                        (scholarship_id, *eligibility_params_template),
                    )
            return scholarship_id
        except Exception as exc:
            if isinstance(exc, ScholarshipRepositoryError):
                raise
            raise ScholarshipRepositoryError(
                "Scholarship and eligibility transaction failed; changes were rolled back"
            ) from exc
