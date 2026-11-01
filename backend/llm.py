
import os
import json
import time
from datetime import date
from math import isfinite
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel, Field, field_validator, model_validator

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
GEMINI_MAX_ATTEMPTS = 3
GEMINI_RETRY_BASE_DELAY_SECONDS = 1.0
RETRYABLE_GEMINI_STATUS_CODES = {408, 429, 500, 502, 503, 504}
RETRYABLE_TRANSPORT_ERRORS = {
    "ConnectError", "ConnectTimeout", "ReadTimeout", "WriteTimeout",
    "PoolTimeout", "TimeoutException", "RemoteProtocolError",
}


class ScholarshipData(BaseModel):
    name: str | None = None
    provider: str | None = None
    description: str | None = None
    application_url: str | None = None
    official_pdf_urls: dict[str, str] = Field(default_factory=dict)

    application_open_date: str | None = None
    deadline: str | None = None
    max_family_income: float | None = None
    min_qualification_level: str | None = None
    min_qualification_marks: float | None = None
    required_course_level: str | None = None
    eligible_courses: list[str] = Field(default_factory=list)
    eligible_course_years: list[int] = Field(default_factory=list)

    min_entrance_rank: int | None = None
    min_age: int | None = None
    max_age: int | None = None
    eligible_genders: list[str] = Field(default_factory=list)
    eligible_categories: list[str] = Field(default_factory=list)
    eligible_domiciles: list[str] = Field(default_factory=list)
    eligible_institutions: list[str] = Field(default_factory=list)

    requires_disability: bool | None = None
    requires_orphan_status: bool | None = None
    eligible_parent_occupations: list[str] = Field(default_factory=list)
    allows_other_scholarships: bool | None = None

    scholarship_amount: float | None = None
    benefit_duration_months: int | None = None

    @field_validator("application_open_date", "deadline", mode="before")
    @classmethod
    def validate_iso_date(cls, value):
        if value is None:
            return None
        if isinstance(value, date):
            return value.isoformat()
        if not isinstance(value, str):
            raise ValueError("Date must be an ISO YYYY-MM-DD string or null")

        value = value.strip()
        if not value:
            return None
        try:
            parsed = date.fromisoformat(value)
        except ValueError as error:
            raise ValueError("Date must use ISO YYYY-MM-DD format") from error
        if parsed.isoformat() != value:
            raise ValueError("Date must use ISO YYYY-MM-DD format")
        return value

    @field_validator(
        "max_family_income", "min_qualification_marks", "min_entrance_rank",
        "min_age", "max_age", "scholarship_amount", "benefit_duration_months",
        mode="before",
    )
    @classmethod
    def validate_nonnegative_numeric_values(cls, value):
        if value is None:
            return None
        if isinstance(value, bool):
            raise ValueError("Boolean values are not valid numeric scholarship data")
        try:
            number = float(value)
        except (TypeError, ValueError) as error:
            raise ValueError("Value must be a finite non-negative number") from error
        if not isfinite(number) or number < 0:
            raise ValueError("Value must be a finite non-negative number")
        return value

    @field_validator("min_qualification_marks")
    @classmethod
    def validate_marks_range(cls, value):
        if value is not None and value > 100:
            raise ValueError("Minimum qualification marks must be between 0 and 100")
        return value

    @field_validator("min_age", "max_age")
    @classmethod
    def validate_age_range(cls, value):
        if value is not None and value > 120:
            raise ValueError("Age must be 120 or less")
        return value

    @field_validator("eligible_course_years")
    @classmethod
    def validate_course_years(cls, value):
        if value is not None and any(year < 1 for year in value):
            raise ValueError("Eligible course years must be positive")
        return value

    @model_validator(mode="after")
    def validate_date_and_age_order(self):
        if (self.application_open_date and self.deadline
                and date.fromisoformat(self.application_open_date)
                > date.fromisoformat(self.deadline)):
            raise ValueError("Application open date must not be after the deadline")
        if (self.min_age is not None and self.max_age is not None
                and self.min_age > self.max_age):
            raise ValueError("Minimum age must not exceed maximum age")
        return self


class ScholarshipIdentityError(ValueError):
    """Raised when model output cannot be tied to the supplied listing card."""


def _normalized_scholarship_name(value):
    return " ".join(value.split()).casefold() if isinstance(value, str) else ""


def _apply_trusted_scholarship_name(data, listing_data):
    extracted_name = data.name.strip() if isinstance(data.name, str) else ""
    card_title = listing_data.get("title") if isinstance(listing_data, dict) else None
    card_title = card_title.strip() if isinstance(card_title, str) else ""

    if not card_title:
        if not extracted_name:
            raise ScholarshipIdentityError(
                "Scholarship name is missing and no trusted listing-card title is available"
            )
        return data

    if (extracted_name
            and _normalized_scholarship_name(extracted_name)
            != _normalized_scholarship_name(card_title)):
        raise ScholarshipIdentityError(
            "Extracted scholarship name does not match the listing-card title"
        )

    # Use the exact trusted portal title as the canonical stored name. A missing
    # model name is safe to fill because the card is the source identity.
    return data.model_copy(update={"name": card_title})


def _is_retryable_gemini_error(error):
    current = error
    visited = set()
    while current is not None and id(current) not in visited:
        visited.add(id(current))
        code = getattr(current, "code", None)
        if code is None:
            code = getattr(current, "status_code", None)
        try:
            if int(code) in RETRYABLE_GEMINI_STATUS_CODES:
                return True
        except (TypeError, ValueError):
            pass
        if isinstance(current, (TimeoutError, ConnectionError)):
            return True
        if current.__class__.__name__ in RETRYABLE_TRANSPORT_ERRORS:
            return True
        current = current.__cause__ or current.__context__
    return False


def _generate_with_retries(prompt, config):
    for attempt in range(1, GEMINI_MAX_ATTEMPTS + 1):
        try:
            return client.models.generate_content(
                model="gemini-3.5-flash-lite",
                contents=prompt,
                config=config,
            )
        except Exception as error:
            if not _is_retryable_gemini_error(error) or attempt == GEMINI_MAX_ATTEMPTS:
                raise
            delay = GEMINI_RETRY_BASE_DELAY_SECONDS * (2 ** (attempt - 1))
            print(f"Transient Gemini error; retrying in {delay:g}s "
                  f"(attempt {attempt + 1}/{GEMINI_MAX_ATTEMPTS})")
            time.sleep(delay)


def _gemini_response_schema():
    """Return the Pydantic schema without unsupported Gemini API keywords.

    ScholarshipData remains the source of truth for validation after generation.
    The Developer API does not accept JSON Schema's additionalProperties keyword.
    """
    schema = ScholarshipData.model_json_schema()

    def remove_unsupported_properties(value):
        if isinstance(value, dict):
            value.pop("additionalProperties", None)
            for nested_value in value.values():
                remove_unsupported_properties(nested_value)
        elif isinstance(value, list):
            for nested_value in value:
                remove_unsupported_properties(nested_value)

    remove_unsupported_properties(schema)
    return schema


def extract_scholarship_info(listing_data, pdf_text):
    pdf_section = (
        f"EXTRACTED PDF TEXT:\n{pdf_text}"
        if isinstance(pdf_text, str) and pdf_text.strip()
        else (
            "No PDF text was available. Use only information explicitly present "
            "in the listing-card data."
        )
    )

    prompt = f"""
Extract scholarship information for a scholarship database.

NSP LISTING DATA:
{json.dumps(listing_data, ensure_ascii=False)}

{pdf_section}

Rules:
- Use both sources to extract information.
- Do not invent missing values.
- Use null for unknown scalar fields and [] for unknown lists.
- Use ISO dates (YYYY-MM-DD) only when the full date is clear.
- Store numeric amounts and percentages as numbers.
- Distinguish mandatory eligibility conditions from preferences.
- If rules are conditional or vary by category, do not misrepresent
  them as one universal rule.
- Read the complete supplied source before deciding whether a rule is absent.
  Absence from one section is not evidence that the scholarship lacks the rule.
- Distinguish current rules, dated rules, exceptions, and category-specific
  conditions. Prefer a later/current rule only when the source says it supersedes
  the earlier one. If a conflict cannot be resolved, do not choose arbitrarily:
  set the affected scalar field to null and preserve the conflicting context in
  the description when it is useful.
- Return only information supported by the sources.
"""

    response = _generate_with_retries(
        prompt,
        types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_gemini_response_schema(),
        ),
    )

    extracted = ScholarshipData.model_validate_json(response.text)
    return _apply_trusted_scholarship_name(extracted, listing_data)


# Example usage
if __name__ == "__main__":
    listing_data = {
        "title": "Example Scholarship",
        "brief_info": ["Merit Based Scheme"],
        "pdf_links": {}
    }

    with open("extracted_pdf.txt", "r", encoding="utf-8") as file:
        pdf_text = file.read()

    result = extract_scholarship_info(listing_data, pdf_text)
    print(result.model_dump_json(indent=2))
