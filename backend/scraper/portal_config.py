"""Validation and PostgreSQL storage for scholarship portal configurations."""

import json
import os
import re
from contextlib import contextmanager
from typing import Any, Iterator, Mapping
from urllib.parse import urlparse

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from scraper.fetch import NSP_LISTING_URL
from scraper.parser import NSP_CARD_SELECTOR, NSP_TITLE_SELECTOR


REQUIRED_SELECTORS = ("scholarship_card", "title", "fields", "document_links")

NSP_PORTAL_CONFIG = {
    "portal_key": "nsp",
    "portal_name": "National Scholarship Portal",
    "base_url": "https://scholarships.gov.in",
    "listing_url": NSP_LISTING_URL,
    "extraction_config": {
        "selectors": {
            "scholarship_card": NSP_CARD_SELECTOR,
            "title": NSP_TITLE_SELECTOR,
            "fields": "span",
            "document_links": "a[href]",
        },
        "rules": {
            "field_format": "label_value_colon",
            "split_field_on_first_colon": True,
            "keep_repeated_fields": True,
            "link_schemes": ["http", "https"],
            "relative_links": "resolve_against_listing_url",
        },
    },
    "enabled": True,
}


class PortalConfigValidationError(ValueError):
    """Raised when a portal configuration is incomplete or invalid."""


def _require_text(config: Mapping[str, Any], key: str) -> str:
    value = config.get(key)
    if not isinstance(value, str) or not value.strip():
        raise PortalConfigValidationError(f"{key} must be a non-empty string")
    return value.strip()


def _validate_http_url(value: str, key: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise PortalConfigValidationError(f"{key} must be an absolute HTTP(S) URL")
    return value


def validate_portal_config(config: Mapping[str, Any]) -> dict[str, Any]:
    """Validate and return a normalized copy suitable for database storage."""
    if not isinstance(config, Mapping):
        raise PortalConfigValidationError("portal configuration must be a mapping")

    portal_key = _require_text(config, "portal_key")
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", portal_key):
        raise PortalConfigValidationError(
            "portal_key must use lowercase letters, digits, underscores, or hyphens"
        )

    portal_name = _require_text(config, "portal_name")
    base_url = _validate_http_url(_require_text(config, "base_url"), "base_url")
    listing_url = _validate_http_url(_require_text(config, "listing_url"), "listing_url")

    extraction_config = config.get("extraction_config")
    if not isinstance(extraction_config, Mapping):
        raise PortalConfigValidationError("extraction_config must be a JSON object")
    selectors = extraction_config.get("selectors")
    if not isinstance(selectors, Mapping):
        raise PortalConfigValidationError("extraction_config.selectors must be an object")
    for selector_name in REQUIRED_SELECTORS:
        selector = selectors.get(selector_name)
        if not isinstance(selector, str) or not selector.strip():
            raise PortalConfigValidationError(
                f"extraction_config.selectors.{selector_name} must be a non-empty string"
            )

    enabled = config.get("enabled", True)
    if not isinstance(enabled, bool):
        raise PortalConfigValidationError("enabled must be a boolean")

    try:
        # A JSON round-trip also detaches nested caller-owned mappings and checks
        # that the configuration can be stored as JSONB.
        extraction_config_copy = json.loads(
            json.dumps(extraction_config, ensure_ascii=False, allow_nan=False)
        )
    except (TypeError, ValueError) as exc:
        raise PortalConfigValidationError("extraction_config must contain JSON-compatible values") from exc

    return {
        "portal_key": portal_key,
        "portal_name": portal_name,
        "base_url": base_url,
        "listing_url": listing_url,
        "extraction_config": extraction_config_copy,
        "enabled": enabled,
    }


@contextmanager
def _connection_scope(connection=None) -> Iterator[Any]:
    if connection is not None:
        yield connection
        return

    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set; add it to the environment or backend .env")
    with psycopg.connect(database_url) as opened_connection:
        yield opened_connection


def save_portal_config(config: Mapping[str, Any], *, connection=None) -> dict[str, Any]:
    """Insert or update a portal config; callers may inject a connection for tests."""
    validated = validate_portal_config(config)
    query = """
        INSERT INTO portal_configs (
            portal_key, portal_name, base_url, listing_url, extraction_config, enabled
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (portal_key) DO UPDATE SET
            portal_name = EXCLUDED.portal_name,
            base_url = EXCLUDED.base_url,
            listing_url = EXCLUDED.listing_url,
            extraction_config = EXCLUDED.extraction_config,
            enabled = EXCLUDED.enabled,
            updated_at = now()
        RETURNING id, portal_key, portal_name, base_url, listing_url,
                  extraction_config, enabled, created_at, updated_at
    """
    params = (
        validated["portal_key"],
        validated["portal_name"],
        validated["base_url"],
        validated["listing_url"],
        Jsonb(validated["extraction_config"]),
        validated["enabled"],
    )
    with _connection_scope(connection) as conn:
        with conn.cursor(row_factory=dict_row) as cursor:
            cursor.execute(query, params)
            return cursor.fetchone()


def get_portal_config(portal_key: str, *, connection=None) -> dict[str, Any] | None:
    """Read a portal configuration by key, returning None when it is absent."""
    if not isinstance(portal_key, str) or not portal_key.strip():
        raise PortalConfigValidationError("portal_key must be a non-empty string")

    query = """
        SELECT id, portal_key, portal_name, base_url, listing_url,
               extraction_config, enabled, created_at, updated_at
        FROM portal_configs
        WHERE portal_key = %s
    """
    with _connection_scope(connection) as conn:
        with conn.cursor(row_factory=dict_row) as cursor:
            cursor.execute(query, (portal_key.strip(),))
            return cursor.fetchone()
