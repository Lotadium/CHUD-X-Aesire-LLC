/*
Client Tracking Information - Record schema for Neon (PostgreSQL)
All core tables carry the same audit columns:
  date_created          - when the row was first stored 
  date_last_updated     - when last changed
  last_verified_at      - when last confirmed correct
  updated_by_type       - 'USER' or 'REFRESH' tabase schema · 
  updated_by            - username or refresh 
  version               - 1 on insertion, +1 on every update

Every insert, update, and delete is copied into record_history.

*/

-- Domain --
CREATE TABLE domain (
  
  domain_id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name              VARCHAR(100) NOT NULL CHECK(btrim(name) <> ''), --Check for empty value
  description       VARCHAR(500),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  date_created      TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at  TIMESTAMPTZ,
  updated_by_type   varchar(20) NOT NULL DEFAULT 'USER' CHECK(updated_by_type IN ('USER', 'REFRESH')),
  updated_by        varchar(100),
  version           INTEGER NOT NULL DEFAULT 1
  
);
-- Case insensitive, EMS & ems treated as the same domain 
CREATE UNIQUE INDEX domain_name_idx ON domain (lower(btrim(name)));

-- Department -- 
CREATE TABLE department (
  
  department_id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name              VARCHAR(150) NOT NULL CHECK(btrim(name) <> '')
  
);
-- Case insensitive
CREATE UNIQUE INDEX department_name_idx ON department (lower(btrim(name)));

------------------- Core Entities -----------------------------------------------------------------

-- Organization -- 
CREATE TABLE organization (

  organization_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  domain_id         INTEGER NOT NULL REFERENCES domain (domain_id), --One domain
  name              VARCHAR(250) NOT NULL CHECK(btrim(name) <> ''), 
  website_url       VARCHAR(400),
  date_created      TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at  TIMESTAMPTZ,
  updated_by_type   varchar(20) NOT NULL DEFAULT 'USER' CHECK(updated_by_type IN ('USER', 'REFRESH')),
  updated_by        varchar(100),
  version           INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX organization_domain_idx ON organization (domain_id);

-- Person -- 
CREATE TABLE person (

    person_id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    prefix              VARCHAR(20),
    first_name          VARCHAR(100) NOT NULL CHECK(btrim(first_name) <> ''),
    middle_name         VARCHAR(100),
    last_name           VARCHAR(100) NOT NULL CHECK(btrim(last_name) <> ''), 
    suffix              VARCHAR(20),
    linkedin_url        VARCHAR(300) UNIQUE,
    date_created        TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_last_updated   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_verified_at    TIMESTAMPTZ,
    updated_by_type     varchar(20) NOT NULL DEFAULT 'USER' CHECK(updated_by_type IN ('USER', 'REFRESH')),
    updated_by          varchar(100),
    version             INTEGER NOT NULL DEFAULT 1

);
-- Position -- 
CREATE TABLE position (

    position_id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, 
    person_id           INTEGER NOT NULL REFERENCES person (person_id),
    organization_id     INTEGER NOT NULL REFERENCES organization (organization_id),
    department_id       INTEGER REFERENCES department (department_id), --Optional
    title               VARCHAR(300),
    additional_title    VARCHAR(300),
    phone               VARCHAR(30),
    phone_ext           VARCHAR(10),
    mobile_phone        VARCHAR(30),
    fax                 VARCHAR(30),
    date_created        TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_last_updated   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_verified_at    TIMESTAMPTZ,
    updated_by_type     varchar(20) NOT NULL DEFAULT 'USER' CHECK(updated_by_type IN ('USER', 'REFRESH')),
    updated_by          varchar(100),
    version             INTEGER NOT NULL DEFAULT 1

);
CREATE INDEX position_person_idx ON position (person_id);
CREATE INDEX position_organization_idx ON position (organization_id);

-- EMail -- 
CREATE TABLE email (

    email_id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    person_id           INTEGER NOT NULL REFERENCES person (person_id),
    address             VARCHAR(300) NOT NULL UNIQUE CHECK (address = lower(address) AND address LIKE '%_@_%._%'),
    email_domain        VARCHAR(250), --entered with record
    email_tld           VARCHAR(100), --entered with record 
    date_created        TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_last_updated   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_verified_at    TIMESTAMPTZ,
    updated_by_type     varchar(20) NOT NULL DEFAULT 'USER' CHECK(updated_by_type IN ('USER', 'REFRESH')),
    updated_by          varchar(100),
    version             INTEGER NOT NULL DEFAULT 1

);
CREATE INDEX email_person_idx ON email (person_id);

-- Addition of cleaning typed values before addition to tables?

-- History (Record Versions) -- 
CREATE TABLE record_history (
    history_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name          VARCHAR(50) NOT NULL,
    row_id              INTEGER NOT NULL,
    version             INTEGER NOT NULL,
    operation           VARCHAR(10) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    changed_by_type     VARCHAR(20) NOT NULL CHECK (changed_by_type IN ('USER', 'REFRESH')),
    changed_by          VARCHAR(100), --User credentials/username 
    changed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_data            JSONB NOT NULL, --full row as is after change or before delete
    UNIQUE (table_name, row_id, version, operation)

);
CREATE INDEX record_history_row_idx ON record_history (table_name, row_id, changed_at DESC);


------------------- Versioning & History -----------------------------------------------------------

-- Before update: bump version and timestamp.
-- Runs before updates are saved. Sets new version to old version +1 & sets current time. 
CREATE FUNCTION trg_bump_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.version           := OLD.version + 1;
    NEW.date_last_updated := now();
    RETURN NEW;
END $$;

-- After insert/update/delete: copy the row into record_history.
-- TG_ARGV[0] is the table's primary-key column.
CREATE FUNCTION trg_write_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    r jsonb := to_jsonb(CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END);
BEGIN
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

------------------- Attach Triggers ----------------------------------------------------------------
-- Loop attaches above functions to every table for history collection.
DO $$
DECLARE
    t record;
BEGIN
    FOR t IN SELECT * FROM (VALUES
        ('domain', 'domain_id'), ('organization', 'organization_id'), ('person', 'person_id'),
        ('position', 'position_id'), ('email', 'email_id')) v(tbl, pk)
    LOOP
        EXECUTE format('CREATE TRIGGER c_bump BEFORE UPDATE ON %I
                        FOR EACH ROW EXECUTE FUNCTION trg_bump_version()', t.tbl);
        EXECUTE format('CREATE TRIGGER z_history AFTER INSERT OR UPDATE OR DELETE ON %I
                        FOR EACH ROW EXECUTE FUNCTION trg_write_history(%L)', t.tbl, t.pk);
    END LOOP;
END $$;