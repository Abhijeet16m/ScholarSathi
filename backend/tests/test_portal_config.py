import json
import unittest
from unittest.mock import Mock

from psycopg.types.json import Jsonb

from scraper.portal_config import (
    NSP_PORTAL_CONFIG,
    PortalConfigValidationError,
    get_portal_config,
    save_portal_config,
    validate_portal_config,
)


def make_connection(row=None):
    connection = Mock()
    cursor = Mock()
    cursor.__enter__ = Mock(return_value=cursor)
    cursor.__exit__ = Mock(return_value=False)
    cursor.fetchone.return_value = row
    connection.cursor.return_value = cursor
    return connection, cursor


class PortalConfigValidationTests(unittest.TestCase):
    def test_nsp_configuration_uses_verified_selectors_and_is_json_serializable(self):
        validated = validate_portal_config(NSP_PORTAL_CONFIG)
        encoded = json.dumps(validated["extraction_config"])

        self.assertEqual(validated["portal_key"], "nsp")
        self.assertEqual(
            json.loads(encoded)["selectors"],
            {
                "scholarship_card": "div.col-md-10",
                "title": "h6",
                "fields": "span",
                "document_links": "a[href]",
            },
        )

    def test_rejects_missing_selector_and_invalid_listing_url(self):
        config = dict(NSP_PORTAL_CONFIG)
        config["extraction_config"] = {
            "selectors": {"scholarship_card": "div.card"}
        }
        with self.assertRaisesRegex(PortalConfigValidationError, "selectors.title"):
            validate_portal_config(config)

        config = dict(NSP_PORTAL_CONFIG)
        config["listing_url"] = "file:///tmp/page.html"
        with self.assertRaisesRegex(PortalConfigValidationError, "listing_url"):
            validate_portal_config(config)

    def test_rejects_non_json_extraction_values(self):
        config = dict(NSP_PORTAL_CONFIG)
        config["extraction_config"] = {
            **NSP_PORTAL_CONFIG["extraction_config"],
            "unsupported": object(),
        }

        with self.assertRaisesRegex(PortalConfigValidationError, "JSON-compatible"):
            validate_portal_config(config)


class PortalConfigPersistenceTests(unittest.TestCase):
    def test_save_serializes_config_as_jsonb_and_returns_saved_row(self):
        expected = {"id": 7, "portal_key": "nsp", "enabled": True}
        connection, cursor = make_connection(expected)

        result = save_portal_config(NSP_PORTAL_CONFIG, connection=connection)

        self.assertEqual(result, expected)
        params = cursor.execute.call_args.args[1]
        self.assertEqual(params[0], "nsp")
        self.assertIsInstance(params[4], Jsonb)
        self.assertEqual(params[4].obj, NSP_PORTAL_CONFIG["extraction_config"])
        self.assertIn("ON CONFLICT (portal_key)", cursor.execute.call_args.args[0])

    def test_get_reads_by_key_and_returns_none_for_missing_config(self):
        connection, cursor = make_connection(None)

        result = get_portal_config("nsp", connection=connection)

        self.assertIsNone(result)
        cursor.execute.assert_called_once()
        self.assertEqual(cursor.execute.call_args.args[1], ("nsp",))


if __name__ == "__main__":
    unittest.main()
