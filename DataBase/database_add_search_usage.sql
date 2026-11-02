-- Web search usage log (CHUD-49). Run after database_add_website_discovery.sql.
-- One row per web search sent to the search provider, so the app can show how many
-- searches were used this month (search is a paid, per-request cost for Aesire).
-- Rows are never edited or deleted. Safe to run more than once.
CREATE TABLE IF NOT EXISTS web_search_log (
    search_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    searched_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    organization_id INTEGER REFERENCES organization (organization_id), -- the entity searched for, if known
    provider        VARCHAR(30),                                       -- e.g. 'brave'
    searched_by     VARCHAR(100)                                       -- X-User of whoever started it
);
CREATE INDEX IF NOT EXISTS web_search_log_searched_at_idx ON web_search_log (searched_at);