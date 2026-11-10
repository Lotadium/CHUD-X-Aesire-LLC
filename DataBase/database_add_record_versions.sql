-- Record versions and last verified date (CHUD-36).
-- Run after database_schema.sql and the other add-on files. Safe to run more than once.
--
-- 1. An update that changes nothing (or only last_verified_at) is not a new version:
--    the version, last updated date and updated_by stay as they were, and no history row is written.
-- 2. last_verified_at is set automatically when a row is created.

-- Before update: bump version and timestamp, but only when a real value changed.
CREATE OR REPLACE FUNCTION trg_bump_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    audit text[] := ARRAY['version', 'date_last_updated', 'last_verified_at', 'updated_by', 'updated_by_type'];
BEGIN
    IF (to_jsonb(NEW) - audit) = (to_jsonb(OLD) - audit) THEN
        -- Nothing but the audit columns changed: keep the current version.
        NEW.version           := OLD.version;
        NEW.date_last_updated := OLD.date_last_updated;
        NEW.updated_by        := OLD.updated_by;
        NEW.updated_by_type   := OLD.updated_by_type;
    ELSE
        NEW.version           := OLD.version + 1;
        NEW.date_last_updated := now();
    END IF;
    RETURN NEW;
END $$;

-- After insert/update/delete: copy the row into record_history,
-- except for an update that did not create a new version.
CREATE OR REPLACE FUNCTION trg_write_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    r jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.version = OLD.version THEN
        RETURN NULL;
    END IF;
    INSERT INTO record_history (table_name, row_id, version, operation,
                                changed_by_type, changed_by, row_data)
    VALUES (TG_TABLE_NAME,
            (r ->> TG_ARGV[0])::integer,
            (r ->> 'version')::integer,
            TG_OP,
            r ->> 'updated_by_type',
            CASE WHEN TG_OP = 'DELETE'
                 THEN coalesce(nullif(current_setting('app.changed_by', true), ''), r ->> 'updated_by')
                 ELSE r ->> 'updated_by' END,
            r);
    RETURN NULL;
END $$;

-- last_verified_at is set when a row is created.
ALTER TABLE domain       ALTER COLUMN last_verified_at SET DEFAULT now();
ALTER TABLE organization ALTER COLUMN last_verified_at SET DEFAULT now();
ALTER TABLE person       ALTER COLUMN last_verified_at SET DEFAULT now();
ALTER TABLE position     ALTER COLUMN last_verified_at SET DEFAULT now();
ALTER TABLE email        ALTER COLUMN last_verified_at SET DEFAULT now();

-- Existing rows: treat their last update as their last verification.
-- This runs after the trigger change above, so it creates no new versions.
UPDATE domain       SET last_verified_at = date_last_updated WHERE last_verified_at IS NULL;
UPDATE organization SET last_verified_at = date_last_updated WHERE last_verified_at IS NULL;
UPDATE person       SET last_verified_at = date_last_updated WHERE last_verified_at IS NULL;
UPDATE position     SET last_verified_at = date_last_updated WHERE last_verified_at IS NULL;
UPDATE email        SET last_verified_at = date_last_updated WHERE last_verified_at IS NULL;
