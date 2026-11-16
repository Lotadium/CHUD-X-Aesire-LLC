-- Activity log (CHUD-38, charter 2.3 g.ii and g.iii). Run after database_add_search_usage.sql.
-- One row per thing that happened to a record: created, edited by a person, flagged as no longer
-- valid, or checked by the refresh. The activity log page reads this table, newest first.
-- Rows are never edited or deleted. Safe to run more than once.
-- AI use: written with help from Claude (Anthropic).
CREATE TABLE IF NOT EXISTS activity_log (
    activity_id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    action          VARCHAR(20) NOT NULL
                    CHECK (action IN ('CREATED', 'MANUAL_UPDATE', 'FLAGGED', 'REFRESH_ATTEMPT', 'REFRESH_SUCCESS')),
    -- The record the entry is about: which table, and its id in that table.
    record_type     VARCHAR(20) NOT NULL CHECK (record_type IN ('organization', 'person', 'position', 'email')),
    record_id       INTEGER NOT NULL,
    -- The entity (organization) and contact (person) the record belongs to, when known.
    -- Used for the page's entity filter and for the link to the record.
    organization_id INTEGER REFERENCES organization (organization_id),
    person_id       INTEGER REFERENCES person (person_id),
    -- Who did it: a person (USER, with their name) or the automatic refresh (REFRESH).
    actor_type      VARCHAR(20) NOT NULL CHECK (actor_type IN ('USER', 'REFRESH')),
    actor_name      VARCHAR(100),
    detail          VARCHAR(500)  -- short description, e.g. "Changed: name, website_url"
);
CREATE INDEX IF NOT EXISTS activity_log_occurred_idx ON activity_log (occurred_at DESC, activity_id DESC);
CREATE INDEX IF NOT EXISTS activity_log_organization_idx ON activity_log (organization_id);
CREATE INDEX IF NOT EXISTS activity_log_person_idx ON activity_log (person_id);
