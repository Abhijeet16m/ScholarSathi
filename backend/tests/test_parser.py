import unittest

from scraper.parser import NoScholarshipCardsError, parse_listing_html


class ParseListingHtmlTests(unittest.TestCase):
    def test_extracts_normalized_records_fields_and_absolute_links(self):
        html = """
        <div class="col-md-10">
          <h6>  Merit Scholarship <span>2026</span> </h6>
          <span>Provider: Example Ministry</span>
          <span>Open till: 31-10-2026</span>
          <a href="/apply/merit">Apply now</a>
          <a href="https://scholarships.gov.in/docs/merit.pdf">Specifications</a>
          <a href="javascript:void(0)">More</a>
        </div>
        """

        records = parse_listing_html(html)

        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["title"], "Merit Scholarship 2026")
        self.assertEqual(
            records[0]["fields"],
            {"Provider": "Example Ministry", "Open till": "31-10-2026"},
        )
        self.assertEqual(
            records[0]["links"],
            [
                {
                    "label": "Apply now",
                    "url": "https://scholarships.gov.in/apply/merit",
                    "type": "application",
                },
                {
                    "label": "Specifications",
                    "url": "https://scholarships.gov.in/docs/merit.pdf",
                    "type": "specification",
                },
            ],
        )

    def test_missing_fields_and_title_are_handled_without_crashing(self):
        html = """
        <div class="col-md-10"><h6>Title only</h6></div>
        <div class="col-md-10"><span>Not a scholarship card without a title</span></div>
        """

        records = parse_listing_html(html)

        self.assertEqual(records, [{"title": "Title only", "fields": {}, "links": []}])

    def test_repeated_fields_are_preserved(self):
        html = """
        <div class="col-md-10">
          <h6>Repeated data</h6>
          <span>Category: SC</span><span>Category: ST</span>
        </div>
        """

        records = parse_listing_html(html)

        self.assertEqual(records[0]["fields"]["Category"], ["SC", "ST"])

    def test_raises_diagnostic_when_no_cards_are_found(self):
        with self.assertRaisesRegex(NoScholarshipCardsError, "No scholarship cards found"):
            parse_listing_html("<html><body><p>Unrecognized page</p></body></html>")


if __name__ == "__main__":
    unittest.main()
