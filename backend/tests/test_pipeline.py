import unittest
from unittest.mock import Mock, call

from scraper.pdf_extractor import ExtractedPDFText, PDFPageText
from scraper.pipeline import run_nsp_pipeline
from scraper.portal_config import NSP_PORTAL_CONFIG


DETAIL_URL = "https://scholarships.gov.in/scheme/example"
PDF_URL = "https://scholarships.gov.in/docs/example-guidelines.pdf"
DOCUMENT = ExtractedPDFText(
    source_url=PDF_URL,
    pages=(PDFPageText(1, "Annual family income must not exceed Rs. 2,50,000."),),
)


def record(title="Example Scholarship", detail_url=DETAIL_URL):
    return {
        "title": title,
        "fields": {"Ministry": "Ministry of Example", "Course": "B.Tech"},
        "links": [
            {"label": "View Details", "url": detail_url, "type": "document"},
            {"label": "Specifications", "url": PDF_URL, "type": "specification"},
            {"label": "Apply", "url": "https://apply.example.test", "type": "application"},
        ],
    }


def config():
    return {**NSP_PORTAL_CONFIG, "enabled": True}


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.fetcher = Mock(return_value="<html></html>")
        self.parser = Mock(return_value=[record()])
        self.pdf_extractor = Mock(return_value=DOCUMENT)
        self.eligibility_extractor = Mock(return_value={"source_document_url": PDF_URL})
        self.hash_reader = Mock(return_value=None)
        self.writer = Mock(return_value=42)

    def run_pipeline(self, records=None):
        self.parser.return_value = [record()] if records is None else records
        return run_nsp_pipeline(
            portal_config=config(),
            fetcher=self.fetcher,
            parser=self.parser,
            pdf_extractor=self.pdf_extractor,
            eligibility_extractor=self.eligibility_extractor,
            hash_reader=self.hash_reader,
            writer=self.writer,
        )

    def test_processes_stable_official_identity_and_writes_hash(self):
        report = self.run_pipeline()

        self.assertEqual(report.results[0].status, "processed")
        self.assertEqual(report.results[0].source_url, DETAIL_URL)
        self.fetcher.assert_called_once()
        self.pdf_extractor.assert_called_once_with(pdf_url=PDF_URL)
        self.eligibility_extractor.assert_called_once_with(DOCUMENT)
        self.hash_reader.assert_called_once_with("nsp", DETAIL_URL, connection=None)
        args, kwargs = self.writer.call_args
        self.assertEqual(args[0]["source_url"], DETAIL_URL)
        self.assertEqual(args[0]["name"], "Example Scholarship")
        self.assertEqual(len(args[2]), 64)
        self.assertIsNone(kwargs["connection"])

    def test_unchanged_hash_skips_gemini_and_database_write_after_pdf_fetch(self):
        first_report = self.run_pipeline()
        saved_hash = self.writer.call_args.args[2]
        self.assertEqual(first_report.results[0].status, "processed")

        self.writer.reset_mock()
        self.eligibility_extractor.reset_mock()
        self.hash_reader.return_value = saved_hash
        second_report = self.run_pipeline()

        self.assertEqual(second_report.results[0].status, "unchanged")
        self.pdf_extractor.assert_has_calls([call(pdf_url=PDF_URL), call(pdf_url=PDF_URL)])
        self.assertEqual(self.pdf_extractor.call_count, 2)
        self.eligibility_extractor.assert_not_called()
        self.writer.assert_not_called()

    def test_duplicate_detail_url_skips_both_cards(self):
        report = self.run_pipeline(
            [record("Scholarship A"), record("Scholarship B")]
        )

        self.assertEqual([item.status for item in report.results], ["skipped", "skipped"])
        self.assertTrue(all("shared" in item.reason for item in report.results))
        self.pdf_extractor.assert_not_called()
        self.writer.assert_not_called()

    def test_record_identity_does_not_depend_on_title(self):
        report = self.run_pipeline([record("Renamed Scholarship", DETAIL_URL)])

        self.assertEqual(report.results[0].status, "processed")
        self.assertEqual(self.writer.call_args.args[0]["source_url"], DETAIL_URL)
        self.assertEqual(self.writer.call_args.args[0]["name"], "Renamed Scholarship")

    def test_missing_or_ambiguous_detail_identity_is_skipped(self):
        missing = record()
        missing["links"] = [missing["links"][1]]
        ambiguous = record()
        ambiguous["links"].append(
            {"label": "Read More", "url": "https://scholarships.gov.in/other", "type": "document"}
        )

        report = self.run_pipeline([missing, ambiguous])

        self.assertEqual([item.status for item in report.results], ["skipped", "skipped"])
        self.assertIn("no scholarship-specific", report.results[0].reason)
        self.assertIn("multiple scholarship detail URLs", report.results[1].reason)
        self.writer.assert_not_called()

    def test_failures_leave_hash_unwritten_and_retry_on_next_run(self):
        for failing_stage in ("pdf", "gemini", "validation", "database"):
            with self.subTest(failing_stage=failing_stage):
                self.setUp()
                if failing_stage == "pdf":
                    self.pdf_extractor.side_effect = [RuntimeError("PDF unavailable"), DOCUMENT]
                elif failing_stage in {"gemini", "validation"}:
                    error = ValueError("invalid evidence") if failing_stage == "validation" else RuntimeError("Gemini unavailable")
                    self.eligibility_extractor.side_effect = [error, {"source_document_url": PDF_URL}]
                else:
                    self.writer.side_effect = [RuntimeError("transaction failed"), None]

                failed = self.run_pipeline()
                self.assertEqual(failed.results[0].status, "failed")
                if failing_stage != "pdf":
                    self.writer.reset_mock(side_effect=False)
                retried = self.run_pipeline()
                self.assertEqual(retried.results[0].status, "processed")
                self.assertEqual(self.hash_reader.call_count, 1 if failing_stage == "pdf" else 2)

    def test_listing_normalization_keeps_hash_stable_for_spacing_and_order(self):
        first = record()
        second = record()
        second["title"] = "  Example   Scholarship "
        second["fields"] = {"Course": " B.Tech ", "Ministry": "Ministry of Example"}
        second["links"] = list(reversed(second["links"]))

        first_hash = self._hash_for(first)
        second_hash = self._hash_for(second)
        self.assertEqual(first_hash, second_hash)

    @staticmethod
    def _hash_for(item):
        from scraper.pipeline import _content_hash, _normalized_fields, _normalized_links

        return _content_hash(
            item,
            _normalized_fields(item["fields"]),
            _normalized_links(item),
            DOCUMENT.text,
        )


if __name__ == "__main__":
    unittest.main()
