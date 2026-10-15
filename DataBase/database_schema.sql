/*
Client Tracking Information - Record schema for Neon (PostgreSQL)
All core tables carry the same audit columns:
  date_created - when the row was first stored 
  date_last_updated
  last_verified_at
  updated_by_type 
  updated_by
  version
*/

-- Domain --

CREATE TABLE domain (
  
  domain_id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  description       VARCHAR(500),
  is_active         BOOLEAN NOT NULL DEFAULT True,
  date_created      TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at  TIMESTAMPTZ,
  updated_by_type   varchar(20) NOT NULL DEFAULT 'USER' (updated_by_type IN ('USER', 'REFRESH')),
  updated_by        varchar(100),
  version           INTEGER NOT NULL DEFAULT 1
  
);
-- Case insensitive, EMS & ems treated as the same domain 
CREATE UNIQUE INDEX domain_name_idx ON domain (lower(btrim(name)));

-- Department -- 
CREATE TABLE department (
  
  department_id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name              VARCHAR(150) NOT NULL
  
);
-- Case insensitive
CREATE UNIQUE INDEX department_name_idx ON department (lower(btrim(name)));

------------------- Core Entities -----------------------------------------------------------------

-- Organization -- 
CREATE TABLE organization (

  organization_id   INTEGER GENERATED ALWAYS AS PRIMARY KEY,
  domain_id         INTEGER NOT NULL REFERENCES domain (domain_id), --only ever one domain
  name              VARCHAR(250) NOT NULL, 
  website_url       VARCHAR(400)
  date_created      TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at  TIMESTAMPTZ,
  updated_by_type   varchar(20) NOT NULL DEFAULT 'USER' (updated_by_type IN ('USER', 'REFRESH')),
  updated_by        varchar(100),
  version           INTEGER NOT NULL DEFAULT 1
)
CREATE INDEX organization_domain_idx ON organization (domain_id);

-- Person -- 
CREATE TABLE person (

    person_id           INTEGER GENERATED ALWAYS AS PRIMARY KEY,
    prefix              VARCHAR(20),
    first_name          VARCHAR(100) NOT NULL,
    middle_name         VARCHAR(100),
    last_name           VARCHAR(100) NOT NULL, 
    suffix              VARCHAR(20),
    linkedin_url        VARCHAR(300) UNIQUE,
    date_created        TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_last_updated   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_verified_at    TIMESTAMPTZ,
    updated_by_type     varchar(20) NOT NULL DEFAULT 'USER' (updated_by_type IN ('USER', 'REFRESH')),
    updated_by          varchar(100),
    version             INTEGER NOT NULL DEFAULT 1

);
-- Position -- 
CREATE TABLE position (

    position_id         INTEGER GENERATED ALWAYS AS PRIMARY KEY, 
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
    updated_by_type     varchar(20) NOT NULL DEFAULT 'USER' (updated_by_type IN ('USER', 'REFRESH')),
    updated_by          varchar(100),
    version             INTEGER NOT NULL DEFAULT 1

);
CREATE INDEX position_person_idx ON position (person_id);
CREATE INDEX position_organization_idx ON position (organization_id);

-- EMail -- 
CREATE TABLE email (

    email_id            INTEGER GENERATED ALWAYS AS PRIMARY KEY,
    person_id           INTEGER NOT NULL REFERENCES person (persin_id),
    address             VARCHAR(300) NOT NULL UNIQUE CHECK (address = lower(address) AND address LIKE '%_@_%._%'),
    email_domain        VARCHAR(250), --entered with record
    email_tld           VARCHAR(100), --entered with record 
    date_created        TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_last_updated   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_verified_at    TIMESTAMPTZ,
    updated_by_type     varchar(20) NOT NULL DEFAULT 'USER' (updated_by_type IN ('USER', 'REFRESH')),
    updated_by          varchar(100),
    version             INTEGER NOT NULL DEFAULT 1

);
CREATE INDEX email_person_idx ON email (person_id);

-- Addition of cleaning typed values before addition to tables?

-- History (Record Versions) -- 
CREATE TABLE record_history (
    history_id          INTEGER GENERATED ALWAYS AS PRIMARY KEY,
    table_name          VARCHAR(50) NOT NULL,
    row_id              INTEGER NOT NULL,
    version             INTEGER NOT NULL,
    operation           VARCHAR(10) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    changed_by_type     VARCHAR(20) NOT NULL CHECK (changed_by_type IN ('USER', 'REFRESH')),
    changed_by          VARCHAR(100), --User credentials/username 
    chaged_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_data            jsonb NOT NULL, --full row as is after change or before delete
    UNIQUE (table_name, row_id, version, operation)

);
CREATE INDEX record_history_row_idx ON record_history (table_name, row_id, chaged_at DESC);