import unittest
from contextlib import AbstractContextManager
from unittest.mock import Mock

from psycopg.types.json import Jsonb

from backend.dumps.scraper.scholarship_repository import (
    ScholarshipRepositoryError,
    upsert_scholarship_with_rules,
)


def scholarship_record():
    return {
        "source_portal": "nsp",
        "source_url": "https://scholarships.gov.in/scheme/one",
        "name": "Example Scholarship",
        "provider": "Ministry of Example",
        "description": "{}",
        "application_url": "https://apply.example.test/",
        "deadline": None,
        "official_pdf_urls": ["https://scholarships.gov.in/one-guidelines.pdf"],
    }


def eligibility_record():
    return {
        "max_annual_family_income": {
            "value": 250000,
            "evidence": [{"quote": "Income below Rs. 2,50,000", "page_number": 1}],
        },
        "min_marks_percentage": {"value": None, "evidence": []},
        "eligible_courses": {"value": ["B.Tech"], "evidence": [{"quote": "B.Tech", "page_number": 1}]},
        "eligible_categories": {"value": None, "evidence": []},
        "eligible_genders": {"value": None, "evidence": []},
        "eligible_domicile_states": {"value": None, "evidence": []},
        "other_conditions": {"value": ["Full-time study"], "evidence": [{"quote": "Full-time study", "page_number": 2}]},
        "source_document_url": "https://scholarships.gov.in/one-guidelines.pdf",
    }


class TransactionRecorder(AbstractContextManager):
    def __init__(self):
        self.error_type = None

    def __exit__(self, exc_type, exc, traceback):
        self.error_type = exc_type
        return False


class FakeCursor(AbstractContextManager):
    def __init__(self, fail_on_call=None):
        self.calls = []
        self.fail_on_call = fail_on_call

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def execute(self, query, params):
        self.calls.append((query, params))
        if len(self.calls) == self.fail_on_call:
            raise RuntimeError("simulated database failure")

    def fetchone(self):
        return {"id": 42}


class FakeConnection:
    def __init__(self, fail_on_call=None):
        self.cursor_instance = FakeCursor(fail_on_call)
        self.transaction_context = TransactionRecorder()

    def transaction(self):
        return self.transaction_context

    def cursor(self, *, row_factory=None):
        return self.cursor_instance


class ScholarshipRepositoryTests(unittest.TestCase):
    def test_upserts_both_rows_with_source_conflict_guard_and_jsonb(self):
        connection = FakeConnection()

        result = upsert_scholarship_with_rules(
            scholarship_record(), eligibility_record(), "a" * 64, connection=connection
        )

        self.assertEqual(result, 42)
        self.assertEqual(len(connection.cursor_instance.calls), 2)
        scholarship_sql, scholarship_params = connection.cursor_instance.calls[0]
        self.assertIn("ON CONFLICT (source_portal, source_url)", scholarship_sql)
        self.assertEqual(scholarship_params[0:3], ("nsp", scholarship_record()["source_url"], "a" * 64))
        self.assertIsInstance(scholarship_params[8], Jsonb)

        eligibility_sql, eligibility_params = connection.cursor_instance.calls[1]
        self.assertIn("ON CONFLICT (scholarship_id)", eligibility_sql)
        self.assertEqual(eligibility_params[0], 42)
        self.assertIsInstance(eligibility_params[3], Jsonb)
        self.assertIsInstance(eligibility_params[-1], Jsonb)
        self.assertEqual(
            eligibility_params[-1].obj["facts"]["max_annual_family_income"],
            eligibility_record()["max_annual_family_income"]["evidence"],
        )
        self.assertIsNone(connection.transaction_context.error_type)

    def test_other_conditions_preserves_unknown_null_and_explicit_empty_list(self):
        for value, expected in ((None, None), ([], [])):
            with self.subTest(value=value):
                connection = FakeConnection()
                eligibility = eligibility_record()
                eligibility["other_conditions"] = {"value": value, "evidence": []}

                upsert_scholarship_with_rules(
                    scholarship_record(), eligibility, "d" * 64, connection=connection
                )

                params = connection.cursor_instance.calls[1][1]
                self.assertIsInstance(params[-2], Jsonb)
                self.assertEqual(params[-2].obj, {"conditions": expected})

    def test_database_failure_exits_transaction_with_error_for_rollback(self):
        connection = FakeConnection(fail_on_call=2)

        with self.assertRaisesRegex(ScholarshipRepositoryError, "rolled back"):
            upsert_scholarship_with_rules(
                scholarship_record(), eligibility_record(), "b" * 64, connection=connection
            )

        self.assertIs(connection.transaction_context.error_type, RuntimeError)

    def test_rejects_missing_identity_instead_of_title_only_upsert(self):
        connection = FakeConnection()
        scholarship = scholarship_record()
        scholarship["source_url"] = None

        with self.assertRaisesRegex(ValueError, "source_portal and source_url"):
            upsert_scholarship_with_rules(
                scholarship, eligibility_record(), "c" * 64, connection=connection
            )

        self.assertEqual(connection.cursor_instance.calls, [])


if __name__ == "__main__":
    unittest.main()
