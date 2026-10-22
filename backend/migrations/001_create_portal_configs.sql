CREATE TABLE IF NOT EXISTS portal_configs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    portal_key TEXT NOT NULL UNIQUE,
    portal_name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    listing_url TEXT NOT NULL,
    extraction_config JSONB NOT NULL
        CHECK (jsonb_typeof(extraction_config) = 'object'),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO portal_configs (
    portal_key,
    portal_name,
    base_url,
    listing_url,
    extraction_config,
    enabled
)
VALUES (
    'nsp',
    'National Scholarship Portal',
    'https://scholarships.gov.in',
    'https://scholarships.gov.in/All-Scholarships',
    '{
      "selectors": {
        "scholarship_card": "div.col-md-10",
        "title": "h6",
        "fields": "span",
        "document_links": "a[href]"
      },
      "rules": {
        "field_format": "label_value_colon",
        "split_field_on_first_colon": true,
        "keep_repeated_fields": true,
        "link_schemes": ["http", "https"],
        "relative_links": "resolve_against_listing_url"
      }
    }'::jsonb,
    TRUE
)
ON CONFLICT (portal_key) DO NOTHING;
