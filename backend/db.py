import os
import hashlib
import time
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import Json

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
DB_MAX_ATTEMPTS = 3
DB_RETRY_BASE_DELAY_SECONDS = 0.5

SCHOLARSHIP_COLUMNS = [
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


class _RetryableConnectionError(Exception):
    """Marks a transient connection failure that occurred before a query ran."""


class AmbiguousScholarshipMatch(ValueError):
    """Raised when the available name/provider identity matches multiple rows."""


def _is_missing(value):
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip() or value.strip() in ("{}", "[]")
    if isinstance(value, (list, dict, tuple, set)):
        return not value
    return False


def scholarship_record_complete(record):
    return all(
        not _is_missing(record.get(column))
        for column in SCHOLARSHIP_COLUMNS
        if column not in ("name", "provider")
    )


def _is_retryable_db_error(error):
    if isinstance(error, _RetryableConnectionError):
        return True
    sqlstate = getattr(error, "pgcode", None)
    if sqlstate:
        return (
            sqlstate.startswith("08")
            or sqlstate.startswith("40")
            or sqlstate in {"57P01", "57P02", "57P03"}
        )

    message = str(error).lower()
    transient_messages = (
        "connection refused", "connection reset", "connection timed out",
        "could not connect", "server closed the connection",
        "network is unreachable", "temporary failure",
        "temporarily unavailable", "connection already closed",
    )
    return (
        isinstance(error, (psycopg2.OperationalError, psycopg2.InterfaceError))
        and any(marker in message for marker in transient_messages)
    )


def _with_database_retry(operation, retry_safe=True):
    for attempt in range(1, DB_MAX_ATTEMPTS + 1):
        try:
            return operation()
        except Exception as error:
            safe_to_retry = retry_safe(error) if callable(retry_safe) else retry_safe
            if (not safe_to_retry or attempt == DB_MAX_ATTEMPTS
                    or not _is_retryable_db_error(error)):
                raise
            delay = DB_RETRY_BASE_DELAY_SECONDS * (2 ** (attempt - 1))
            print(f"Transient database error; retrying in {delay:g}s "
                  f"(attempt {attempt + 1}/{DB_MAX_ATTEMPTS})")
            time.sleep(delay)


def find_existing_scholarship(name, provider=None):
    """Return a unique matching row, or None when absent or ambiguous."""
    if not name:
        return None

    selected_columns = ["id"] + SCHOLARSHIP_COLUMNS + ["updated_at"]
    query = f"SELECT {', '.join(selected_columns)} FROM scholarships WHERE name = %s"
    parameters = [name]
    if provider:
        query += " AND provider = %s"
        parameters.append(provider)

    def lookup():
        with psycopg2.connect(DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(query, tuple(parameters))
                rows = cur.fetchmany(2)
                if len(rows) > 1:
                    raise AmbiguousScholarshipMatch(
                        f"Multiple scholarship records match {name!r}; "
                        "a provider is needed to identify one safely"
                    )
                if not rows:
                    return None
                return dict(zip(selected_columns, rows[0]))

    return _with_database_retry(lookup)


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


def upsert_scholarship(data, replace_existing=False, existing_id=None):
    columns = SCHOLARSHIP_COLUMNS

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
        values["status"] = None if replace_existing else "active"

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

    # Treat SQL NULL, blank text, and empty array/JSON values as missing.
    # Cast to text so the same check works for the schema's different types.
    missing = {
        column: (
            f"({column} IS NULL OR "
            f"btrim({column}::text) IN ('', '{{}}', '[]'))"
        )
        for column in update_fields
    }

    if replace_existing:
        insert_assignments = ",\n".join(
            f"{column} = CASE WHEN (EXCLUDED.{column} IS NULL OR "
            f"btrim(EXCLUDED.{column}::text) IN ('', '{{}}', '[]')) "
            f"THEN scholarships.{column} ELSE EXCLUDED.{column} END"
            for column in update_fields
        )
        has_incoming_data = " OR ".join(
            f"NOT (EXCLUDED.{column} IS NULL OR "
            f"btrim(EXCLUDED.{column}::text) IN ('', '{{}}', '[]'))"
            for column in update_fields
        )
        update_condition = f"({has_incoming_data})"
        update_assignments = ",\n".join(
            f"{column} = CASE WHEN (%({column})s IS NULL OR "
            f"btrim(%({column})s::text) IN ('', '{{}}', '[]')) "
            f"THEN scholarships.{column} ELSE %({column})s END"
            for column in update_fields
        )
        existing_update_condition = " OR ".join(
            f"NOT (%({column})s IS NULL OR "
            f"btrim(%({column})s::text) IN ('', '{{}}', '[]'))"
            for column in update_fields
        )
    else:
        insert_assignments = ",\n".join(
            f"{column} = CASE WHEN {missing[column]} "
            f"THEN EXCLUDED.{column} ELSE scholarships.{column} END"
            for column in update_fields
        )
        update_condition = " OR ".join(missing.values())
        update_assignments = ",\n".join(
            f"{column} = CASE WHEN {missing[column]} "
            f"THEN %({column})s ELSE scholarships.{column} END"
            for column in update_fields
        )
        existing_update_condition = update_condition

    insert_query = f"""
        INSERT INTO scholarships ({insert_columns}, rules_verified_at, updated_at)
        VALUES ({placeholders}, NOW(), NOW())
        ON CONFLICT (name, provider)
        DO UPDATE SET
            {insert_assignments},
            rules_verified_at = NOW(),
            updated_at = NOW()
        WHERE {update_condition}
        RETURNING id;
    """
    update_query = f"""
        UPDATE scholarships
        SET {update_assignments}, rules_verified_at = NOW(), updated_at = NOW()
        WHERE id = %(existing_id)s AND ({existing_update_condition})
        RETURNING id;
    """

    def save():
        try:
            conn = psycopg2.connect(DATABASE_URL)
        except Exception as error:
            if _is_retryable_db_error(error):
                raise _RetryableConnectionError(str(error)) from error
            raise

        with conn:
            with conn.cursor() as cur:
                if existing_id is not None:
                    update_values = {**values, "existing_id": existing_id}
                    cur.execute(update_query, update_values)
                elif values["provider"] is None:
                    # NULL values do not conflict under ordinary PostgreSQL
                    # unique semantics. Serialize this key and reuse an existing
                    # row before inserting, without requiring a schema change.
                    lock_key = int.from_bytes(
                        hashlib.sha256(str(values["name"]).encode("utf-8")).digest()[:8],
                        byteorder="big",
                        signed=True,
                    )
                    cur.execute("SELECT pg_advisory_xact_lock(%s)", (lock_key,))
                    cur.execute(
                        "SELECT id FROM scholarships "
                        "WHERE name = %s AND provider IS NULL "
                        "ORDER BY id LIMIT 1 FOR UPDATE",
                        (values["name"],),
                    )
                    existing_row = cur.fetchone()
                    if existing_row:
                        update_values = {**values, "existing_id": existing_row[0]}
                        cur.execute(update_query, update_values)
                    else:
                        cur.execute(insert_query, values)
                else:
                    cur.execute(insert_query, values)
                result = cur.fetchone()
                # A conflict row with no missing fields is deliberately untouched.
                return result[0] if result else None

    # The populated provider uses ON CONFLICT; missing providers use a
    # transaction-scoped advisory lock. Both paths make retries idempotent.
    return _with_database_retry(save)
