
import os
import json
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


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
    prompt = f"""
Extract scholarship information for a scholarship database.

NSP LISTING DATA:
{json.dumps(listing_data, ensure_ascii=False)}

EXTRACTED PDF TEXT:
{pdf_text}

Rules:
- Use both sources to extract information.
- Do not invent missing values.
- Use null for unknown scalar fields and [] for unknown lists.
- Use ISO dates (YYYY-MM-DD) only when the full date is clear.
- Store numeric amounts and percentages as numbers.
- Distinguish mandatory eligibility conditions from preferences.
- If rules are conditional or vary by category, do not misrepresent
  them as one universal rule.
- Return only information supported by the sources.
"""

    response = client.models.generate_content(
        model="gemini-3.5-flash-lite",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_gemini_response_schema(),
        ),
    )

    return ScholarshipData.model_validate_json(response.text)


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
