# CHUD API

REST API for the Client Tracking Information app (Jira task CHUD-13). It runs as a
[Neon Function](https://neon.com/docs/compute/functions/overview) (Node.js + [Hono](https://hono.dev))
and talks to the Postgres schema in [`../DataBase/database_schema.sql`](../DataBase/database_schema.sql).

An **entity** is an `organization`. A **contact** is a `person` plus their `positions` (a job at an
organization) and `emails`.

## Run it

```bash
cd backend
npm install
neon link          # pick the "Client Tracking Information" project; writes .env with DATABASE_URL
npm run dev        # neon dev: serves the API on http://localhost:8787
```

**Without the Neon CLI:** copy the connection string from the Neon console (project → **Connect**,
choose the branch), put it in `backend/.env` as `DATABASE_URL=...`, and run `npm run local`.
It serves the same API on http://localhost:8787 (set `PORT` to change it).

`DATABASE_URL` comes from Neon and lives in `.env`, which is git-ignored. **Never commit it.**
Set `CORS_ORIGIN` (comma-separated origins) to restrict which front-end origins may call the API;
it defaults to any origin for development.

> **Deploying:** Neon Functions are only available in some regions (us-east-1, us-east-2,
> eu-central-1, ap-southeast-1 at the time of writing). Our Neon project is in `aws-us-west-2`,
> so check the [Functions docs](https://neon.com/docs/compute/functions/get-started) before
> running `npm run deploy`.

## Test it

The tests run against a **throwaway local Postgres** loaded with the schema file. They wipe the
database each run, so they refuse to run against Neon or any database without `test` in its name.

```bash
createdb chud_test
TEST_DATABASE_URL=postgres://localhost:5432/chud_test npm test
npm run typecheck
```

## Conventions

- JSON in, JSON out. Base path is `/api`.
- **Who made the change:** send an `X-User` header (a username). It is stored in `updated_by` and
  in `record_history`. Real sign-in is a later sprint; without the header the user is `unknown`.
  Every write through this API is recorded as `updated_by_type = 'USER'`.
- **Updates** (`PUT` or `PATCH`, same behavior) only change the fields you send. Send `null`
  (or `""`) to clear an optional field.
- **Errors** are `{ "error": "message" }`, plus `fields` for validation problems so forms can show
  inline messages:

  ```json
  { "error": "Validation failed",
    "fields": { "last_name": "is required", "emails[0].address": "must be a valid email address" } }
  ```

  | Status | Meaning |
  |---|---|
  | 400 | Invalid input, a bad id, or a referenced record (e.g. `domain_id`) that does not exist |
  | 404 | Unknown record or route |
  | 409 | Duplicate (domain name, email address, LinkedIn URL) or the record is still in use |
  | 500 | Unexpected server error |

- **Lists** accept `limit` (1–200, default 50) and `offset`, and return
  `{ "data": [...], "total": 123, "limit": 50, "offset": 0 }`.
- Emails are lowercased and trimmed; `email_domain` and `email_tld` are filled in automatically.

## Endpoints

### Health and lookups

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{ "status": "ok" }` when the database connection works |
| GET | `/api/domains` | For the domain drop-down |
| POST | `/api/domains` | `{ name, description? }`; names are unique ignoring case |
| GET | `/api/departments` | |
| POST | `/api/departments` | `{ name }` |

### Entities (organizations)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/organizations` | Optional `?domain_id=`. Each row includes `domain_name` |
| POST | `/api/organizations` | `{ domain_id, name, website_url? }` |
| GET | `/api/organizations/:id` | Includes `contacts`: the people who work there |
| PUT/PATCH | `/api/organizations/:id` | Any of `domain_id`, `name`, `website_url` |
| DELETE | `/api/organizations/:id` | 409 if it still has contacts; `?force=true` deletes those positions too (the people are kept) |

### Contacts (people)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/people` | Optional `?organization_id=`. Each person includes `positions` and `emails` |
| POST | `/api/people` | Person fields, plus optional `positions: [...]` and `emails: [...]`, saved all-or-nothing |
| GET | `/api/people/:id` | |
| PUT/PATCH | `/api/people/:id` | Person fields only |
| DELETE | `/api/people/:id` | Also deletes their positions and emails |
| POST | `/api/people/:id/positions` | `{ organization_id, department_id?, title?, additional_title?, phone?, phone_ext?, mobile_phone?, fax? }` |
| PUT/PATCH | `/api/positions/:id` | |
| DELETE | `/api/positions/:id` | |
| POST | `/api/people/:id/emails` | `{ address }` |
| PUT/PATCH | `/api/emails/:id` | `{ address }` |
| DELETE | `/api/emails/:id` | |

Person fields: `prefix`, `first_name` (required), `middle_name`, `last_name` (required), `suffix`,
`linkedin_url`.

### Example

```bash
curl -X POST http://localhost:8787/api/people \
  -H "Content-Type: application/json" -H "X-User: irene" \
  -d '{
        "first_name": "Ana", "last_name": "Lopez",
        "positions": [{ "organization_id": 1, "title": "General Manager", "phone": "916-555-0100" }],
        "emails": [{ "address": "ana.lopez@example.org" }]
      }'
```

## Layout

```
backend/
  neon.ts              declares the function for neon dev / neon deploy
  functions/api.ts     entry point: creates the connection pool and the app
  src/app.ts           routes, CORS, error handling
  src/routes/          lookups, organizations, people
  src/db.ts            transactions (records who made a change) and insert/update helpers
  src/validate.ts      input checks
  src/errors.ts        turns database errors into clean 400/404/409 responses
  test/api.test.ts     integration tests
```
