import json
import os
import unittest
from unittest.mock import Mock, patch

import httpx
from google.genai import errors

from backend.dumps.scraper.eligibility_extractor import (
    DEFAULT_GEMINI_MODEL,
    ELIGIBILITY_RESPONSE_SCHEMA,
    EligibilityResponseError,
    GeminiAPIError,
    GeminiConfigurationError,
    GeminiRateLimitError,
    GeminiServiceUnavailableError,
    GeminiTimeoutError,
    extract_eligibility,
    validate_eligibility_response,
)
from backend.dumps.scraper.pdf_extractor import ExtractedPDFText, PDFPageText


def example_document():
    return ExtractedPDFText(
        source_url="https://scholarships.gov.in/docs/example.pdf",
        pages=(
            PDFPageText(
                1,
                "Annual family income must not exceed Rs. 2,50,000. Applicants need at least 60% marks. Students belonging to SC category may apply.",
            ),
        ),
    )


def valid_payload():
    def fact(value, quote=None, page_number=1):
        return {
            "value": value,
            "evidence": [] if value is None else [
                {"quote": quote, "page_number": page_number}
            ],
        }

    return {
        "max_annual_family_income": fact(250000, "Annual family income must not exceed Rs. 2,50,000."),
        "min_marks_percentage": fact(60, "Applicants need at least 60% marks."),
        "eligible_courses": fact(None),
        "eligible_categories": fact(["SC"], "Students belonging to SC category may apply."),
        "eligible_genders": fact(None),
        "eligible_domicile_states": fact(None),
        "other_conditions": fact(None),
    }


class EligibilityValidationTests(unittest.TestCase):
    def test_validates_facts_and_adds_trusted_source_url(self):
        result = validate_eligibility_response(valid_payload(), example_document())

        self.assertEqual(result["max_annual_family_income"]["value"], 250000)
        self.assertEqual(
            result["source_document_url"],
            "https://scholarships.gov.in/docs/example.pdf",
        )

    def test_rejects_unmatched_quote_and_out_of_range_percentage(self):
        payload = valid_payload()
        payload["min_marks_percentage"]["value"] = 101
        with self.assertRaisesRegex(EligibilityResponseError, "invalid value"):
            validate_eligibility_response(payload, example_document())

        payload = valid_payload()
        payload["max_annual_family_income"]["evidence"][0]["quote"] = "Rs. 9,99,999"
        with self.assertRaisesRegex(EligibilityResponseError, "page 1 after whitespace normalization"):
            validate_eligibility_response(payload, example_document())

    def test_pdf_line_breaks_are_normalized_but_page_and_words_remain_strict(self):
        document = ExtractedPDFText(
            source_url="https://example.test/scholarship.pdf",
            pages=(
                PDFPageText(
                    2,
                    "Family income from all sources should not be more than Rs. 8 lakh per annum during "
                    "\nthe current financial year.",
                ),
            ),
        )
        payload = {
            field: {"value": None, "evidence": []}
            for field in ELIGIBILITY_RESPONSE_SCHEMA["required"]
        }
        payload["max_annual_family_income"] = {
            "value": 800000,
            "evidence": [
                {
                    "quote": "Family income from all sources should not be more than Rs. 8 lakh per annum during the current financial year.",
                    "page_number": 2,
                }
            ],
        }

        result = validate_eligibility_response(payload, document)
        self.assertEqual(result["max_annual_family_income"]["value"], 800000)

        payload["max_annual_family_income"]["evidence"][0]["page_number"] = 1
        with self.assertRaisesRegex(EligibilityResponseError, "page 1 after whitespace normalization"):
            validate_eligibility_response(payload, document)

        payload["max_annual_family_income"]["evidence"][0].update(
            {"quote": "Family income from all sources should not be more than Rs. 9 lakh"}
        )
        payload["max_annual_family_income"]["evidence"][0]["page_number"] = 2
        with self.assertRaisesRegex(EligibilityResponseError, "page 2 after whitespace normalization"):
            validate_eligibility_response(payload, document)

    def test_schema_declares_required_fact_fields(self):
        self.assertEqual(
            set(ELIGIBILITY_RESPONSE_SCHEMA["required"]),
            {
                "max_annual_family_income",
                "min_marks_percentage",
                "eligible_courses",
                "eligible_categories",
                "eligible_genders",
                "eligible_domicile_states",
                "other_conditions",
            },
        )


class GeminiRequestTests(unittest.TestCase):
    def setUp(self):
        self.dotenv_patch = patch("scraper.eligibility_extractor.load_dotenv")
        self.dotenv_patch.start()
        self.client = Mock()
        self.client.interactions.create.return_value.output_text = json.dumps(valid_payload())

    def tearDown(self):
        self.dotenv_patch.stop()

    @patch("scraper.eligibility_extractor.load_dotenv")
    @patch("scraper.eligibility_extractor._create_client")
    def test_missing_api_key_does_not_create_client(self, create_client, load_dotenv):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(GeminiConfigurationError):
                extract_eligibility(example_document())

        create_client.assert_not_called()

    @patch("scraper.eligibility_extractor._create_client")
    def test_sends_structured_prompt_and_returns_validated_result(self, create_client):
        create_client.return_value = self.client
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}, clear=True):
            result = extract_eligibility(example_document())

        self.assertEqual(result["max_annual_family_income"]["value"], 250000)
        self.assertEqual(create_client.call_args.args[1], 60)
        self.client.interactions.create.assert_called_once()
        kwargs = self.client.interactions.create.call_args.kwargs
        self.assertEqual(kwargs["model"], DEFAULT_GEMINI_MODEL)
        self.assertEqual(kwargs["response_format"]["mime_type"], "application/json")
        self.assertEqual(
            kwargs["response_format"]["schema"],
            ELIGIBILITY_RESPONSE_SCHEMA,
        )
        self.assertIn("untrusted_pdf_text", kwargs["input"])
        self.assertIn("untrusted source data", kwargs["system_instruction"])
        self.client.close.assert_called_once_with()

    @patch("scraper.eligibility_extractor._create_client")
    def test_malformed_json_is_not_reported_as_success(self, create_client):
        client = Mock()
        client.interactions.create.return_value.output_text = "{not-json"
        create_client.return_value = client
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}, clear=True):
            with self.assertRaisesRegex(EligibilityResponseError, "malformed JSON"):
                extract_eligibility(example_document())

    @patch("scraper.eligibility_extractor._create_client")
    def test_rate_limit_and_api_errors_are_distinguished(self, create_client):
        for code, expected_error in ((429, GeminiRateLimitError), (500, GeminiAPIError)):
            client = Mock()
            client.interactions.create.side_effect = errors.APIError(
                code=code,
                response_json={"error": {"message": "mocked"}},
            )
            create_client.return_value = client
            with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}, clear=True):
                with self.assertRaises(expected_error):
                    extract_eligibility(example_document())

    @patch("scraper.eligibility_extractor._create_client")
    def test_service_unavailable_includes_actionable_sanitized_details(self, create_client):
        client = Mock()
        client.interactions.create.side_effect = errors.APIError(
            code=503,
            response_json={"error": {"message": "high demand for test-key"}},
        )
        create_client.return_value = client
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}, clear=True):
            with self.assertRaises(GeminiServiceUnavailableError) as caught:
                extract_eligibility(example_document())

        message = str(caught.exception)
        self.assertIn("HTTP 503", message)
        self.assertIn("try again later", message)
        self.assertIn("high demand", message)
        self.assertNotIn("test-key", message)
        self.assertIn("No automatic retry", message)

    @patch("scraper.eligibility_extractor._create_client")
    def test_timeout_is_reported_clearly(self, create_client):
        client = Mock()
        client.interactions.create.side_effect = TimeoutError("simulated timeout")
        create_client.return_value = client
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}, clear=True):
            with self.assertRaisesRegex(GeminiTimeoutError, "60s"):
                extract_eligibility(example_document())

    @patch("scraper.eligibility_extractor._create_client")
    def test_wrapped_httpx_read_timeout_preserves_safe_detail(self, create_client):
        client = Mock()
        wrapper = RuntimeError("SDK transport failed")
        wrapper.__cause__ = httpx.ReadTimeout("read timed out")
        client.interactions.create.side_effect = wrapper
        create_client.return_value = client
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}, clear=True):
            with self.assertRaises(GeminiTimeoutError) as caught:
                extract_eligibility(example_document())
        self.assertIn("read timed out", str(caught.exception))

    @patch("scraper.eligibility_extractor._create_client")
    def test_timeout_can_be_configured_through_environment(self, create_client):
        create_client.return_value = self.client
        with patch.dict(
            os.environ,
            {"GEMINI_API_KEY": "test-key", "GEMINI_REQUEST_TIMEOUT_SECONDS": "35"},
            clear=True,
        ):
            extract_eligibility(example_document())
        self.assertEqual(create_client.call_args.args[1], 35)


if __name__ == "__main__":
    unittest.main()
