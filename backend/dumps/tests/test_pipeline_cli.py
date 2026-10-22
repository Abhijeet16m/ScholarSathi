import io
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest.mock import patch

from backend.dumps.scraper.fetch import PageFetchError
from backend.dumps.scraper.parser import NoScholarshipCardsError
from backend.dumps.scraper.pipeline import CardResult, PipelineConfigurationError, PipelineReport, main


class PipelineCliTests(unittest.TestCase):
    def test_format_and_main_print_counts_and_card_reasons(self):
        report = PipelineReport(
            (
                CardResult("Processed A", "processed"),
                CardResult("Unchanged B", "unchanged"),
                CardResult("Skipped C", "skipped", "detail URL is missing"),
                CardResult(
                    "Failed D",
                    "failed",
                    "HTTP 503 token=private-token at https://user:password@example.test/doc?token=secret",
                ),
            )
        )
        stdout = io.StringIO()
        stderr = io.StringIO()
        with patch("scraper.pipeline.run_nsp_pipeline", return_value=report):
            with redirect_stdout(stdout), redirect_stderr(stderr):
                exit_code = main([])

        output = stdout.getvalue()
        self.assertEqual(exit_code, 1)
        self.assertEqual(stderr.getvalue(), "")
        self.assertIn("Processed: 1", output)
        self.assertIn("Unchanged: 1", output)
        self.assertIn("Skipped: 1", output)
        self.assertIn("Failed: 1", output)
        self.assertIn("Skipped C — detail URL is missing", output)
        self.assertIn("Failed D — HTTP 503", output)
        self.assertNotIn("private-token", output)
        self.assertNotIn("password", output)
        self.assertNotIn("secret", output)
        self.assertNotIn("?token", output)

    def test_all_skipped_is_nonfatal_and_prints_summary(self):
        report = PipelineReport(
            (CardResult("Skipped", "skipped", "identity missing"),)
        )
        stdout = io.StringIO()
        with patch("scraper.pipeline.run_nsp_pipeline", return_value=report):
            with redirect_stdout(stdout):
                exit_code = main([])

        self.assertEqual(exit_code, 0)
        self.assertIn("Skipped: 1", stdout.getvalue())
        self.assertIn("Failed: 0", stdout.getvalue())

    def test_run_level_configuration_fetch_and_parse_errors_exit_nonzero(self):
        failures = (
            PipelineConfigurationError("NSP portal configuration is missing"),
            PageFetchError("Failed to fetch portal page https://example.test/listing"),
            NoScholarshipCardsError("No scholarship cards found; page structure changed"),
        )
        for failure in failures:
            with self.subTest(error=type(failure).__name__):
                stdout = io.StringIO()
                stderr = io.StringIO()
                with patch("scraper.pipeline.run_nsp_pipeline", side_effect=failure):
                    with redirect_stdout(stdout), redirect_stderr(stderr):
                        exit_code = main([])

                self.assertEqual(exit_code, 1)
                self.assertEqual(stdout.getvalue(), "")
                self.assertIn(type(failure).__name__, stderr.getvalue())
                self.assertIn(str(failure), stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
