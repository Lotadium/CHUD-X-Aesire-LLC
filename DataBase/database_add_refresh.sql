-- Data refresh runs (CHUD-35). Run after database_add_search_usage.sql.
-- A refresh is a list of records (entities) that the API works through a few at a time,
-- because the front end polls for progress and each request has a time limit.
-- One row per run, and one row per record in that run with its result. Rows are never
-- deleted: they are the record of what each refresh did. Safe to run more than once.
CREATE TABLE IF NOT EXISTS refresh_run (
    run_id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    requested_by    VARCHAR(100),                       -- X-User of whoever started it
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at     TIMESTAMPTZ                         -- set when the last record is done
);

CREATE TABLE IF NOT EXISTS refresh_item (
    item_id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    run_id          INTEGER NOT NULL REFERENCES refresh_run (run_id),
    organization_id INTEGER NOT NULL REFERENCES organization (organization_id),
    seq             INTEGER NOT NULL,                   -- the order records are processed in
    status          VARCHAR(12) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'PROCESSING', 'VERIFIED', 'UNVERIFIED')),
    reason_code     VARCHAR(40),                        -- why a record is UNVERIFIED (short code)
    reason          TEXT,                               -- the same, in words, for the summary
    changed         BOOLEAN NOT NULL DEFAULT false,     -- true when the refresh updated or added something on this record
    claimed_at      TIMESTAMPTZ,                        -- when a request picked it up
    processed_at    TIMESTAMPTZ,
    UNIQUE (run_id, organization_id)
);
-- For a database that already has the table from an earlier version of this file.
ALTER TABLE refresh_item ADD COLUMN IF NOT EXISTS changed BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS refresh_item_run_idx ON refresh_item (run_id, status, seq);
