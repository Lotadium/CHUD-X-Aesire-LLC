-- Website discovery columns (CHUD-30). Run after database_schema.sql and database_add_flag_columns.sql.
ALTER TABLE organization
    ADD COLUMN IF NOT EXISTS website_status VARCHAR(20) NOT NULL DEFAULT 'NOT_SEARCHED'
        CHECK (website_status IN ('NOT_SEARCHED','FOUND','NEEDS_REVIEW','NOT_FOUND')),
    ADD COLUMN IF NOT EXISTS website_source VARCHAR(10)
        CHECK (website_source IN ('AUTO','MANUAL')),
    ADD COLUMN IF NOT EXISTS website_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS website_candidate (
    candidate_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id INTEGER NOT NULL REFERENCES organization (organization_id),
    url             VARCHAR(400) NOT NULL,
    page_title      VARCHAR(300),
    score           NUMERIC(5,2),
    rank            SMALLINT NOT NULL CHECK (rank BETWEEN 1 AND 3),
    date_created    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, url)
);
CREATE INDEX IF NOT EXISTS website_candidate_org_idx ON website_candidate (organization_id);
