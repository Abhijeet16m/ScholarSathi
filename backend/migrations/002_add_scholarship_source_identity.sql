BEGIN;

ALTER TABLE public.scholarships
    ADD COLUMN IF NOT EXISTS source_portal TEXT,
    ADD COLUMN IF NOT EXISTS source_url TEXT,
    ADD COLUMN IF NOT EXISTS content_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS scholarships_source_identity_uq
    ON public.scholarships (source_portal, source_url)
    WHERE source_portal IS NOT NULL AND source_url IS NOT NULL;

ALTER TABLE public.eligibility_rules
    ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
