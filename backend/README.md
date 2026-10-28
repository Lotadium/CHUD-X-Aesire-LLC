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

The tests run against a **throwaway local Postgres** built from the schema files in `DataBase/` (the base schema, then the
flag and website-discovery add-ons). They wipe the
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

## Records are never deleted

The client does not want records deleted. **There are no DELETE endpoints** (a DELETE request returns 404).
A record that is no longer valid is **flagged** instead and keeps all of its history:

```bash
# flag an organization (a reason is required)
curl -X PUT http://localhost:8787/api/organizations/1 -H "Content-Type: application/json" -H "X-User: irene" \
  -d '{ "is_flagged": true, "flag_reason": "District dissolved" }'

# clear the flag (the reason is cleared too)
curl -X PUT http://localhost:8787/api/organizations/1 -H "Content-Type: application/json" -H "X-User: irene" \
  -d '{ "is_flagged": false }'
```

- Works the same on people, positions and emails.
- `flag_reason` is required when `is_flagged` is `true`, and can only be sent together with `is_flagged`.
- Every response includes `is_flagged` and `flag_reason`, so forms and lists can show flagged records.
- These need the `is_flagged` (boolean, default false) and `flag_reason` (up to 500 characters) columns on
  `organization`, `person`, `position` and `email` in the schema (owned by CHUD-10).

## Endpoints

### Health and lookups

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{ "status": "ok" }` when the database connection works |
| GET | `/api/domains` | For the domain drop-down |
| POST | `/api/domains` | `{ name, description? }`; names are unique ignoring case |
| GET | `/api/departments` | |
| POST | `/api/departments` | `{ name }` |
| POST | `/api/web-search` | `{ firstName, lastName, organizationName?, middleName?, nameSuffix?, title?, departmentName?, organizationDomain?, city?, county?, state? }`; returns array of `{ title, url, description }` |

### Entities (organizations)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/organizations` | Optional `?domain_id=` and `?website_status=` (NOT_SEARCHED, FOUND, NEEDS_REVIEW, NOT_FOUND). Each row includes `domain_name`, the website fields and `website_candidates` |
| POST | `/api/organizations` | `{ domain_id, name, website_url? }` |
| GET | `/api/organizations/:id` | Includes `contacts`: the people who work there |
| PUT/PATCH | `/api/organizations/:id` | Any of `domain_id`, `name`, `website_url`, `is_flagged`, `flag_reason`. Changing `website_url` follows the website rules below |
| PUT | `/api/organizations/:id/website` | Set the website by hand: `{ url, confirm_overwrite? }` |
| POST | `/api/organizations/:id/website/discovery` | Save a website-discovery result (see below) |
| POST | `/api/organizations/:id/website/reject-candidates` | "None of these suggestions is right" (no body). Keeps an existing website (back to `FOUND`) or marks `NOT_FOUND`. 409 if nothing is waiting |

### Contacts (people)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/people` | Optional `?organization_id=`. Each person includes `positions` and `emails` |
| POST | `/api/people` | Person fields, plus optional `positions: [...]` and `emails: [...]`, saved all-or-nothing |
| GET | `/api/people/:id` | |
| PUT/PATCH | `/api/people/:id` | Person fields, `is_flagged`, `flag_reason` |
| POST | `/api/people/:id/positions` | `{ organization_id, department_id?, title?, additional_title?, phone?, phone_ext?, mobile_phone?, fax? }` |
| PUT/PATCH | `/api/positions/:id` | Position fields, `is_flagged`, `flag_reason` |
| POST | `/api/people/:id/emails` | `{ address }` |
| PUT/PATCH | `/api/emails/:id` | `{ address }`, or `is_flagged`, `flag_reason` |

Person fields: `prefix`, `first_name` (required), `middle_name`, `last_name` (required), `suffix`,
`linkedin_url`.

## Website discovery (CHUD-30)

Each organization has `website_url` plus: `website_status` (`NOT_SEARCHED` by default, `FOUND`, `NEEDS_REVIEW` or
`NOT_FOUND`), `website_source` (`AUTO` or `MANUAL`), `website_updated_at`, and `website_candidates` (up to 3
`{ candidate_id, url, page_title, score, rank }`, best first, or an empty list). These come from
`DataBase/database_add_website_discovery.sql`.

**Set by hand** (entity page, review screen):

```bash
curl -X PUT http://localhost:8787/api/organizations/1/website -H "Content-Type: application/json" -H "X-User: irene" \
  -d '{ "url": "https://example.org" }'
```

Saves it as `FOUND` / `MANUAL` and drops any candidates waiting for review. The URL must be http or https.

**Save a discovery result** (called after the search and ranking steps). The response is
`{ "result": ..., "organization": {...} }`:

| Body | Effect | `result` |
|---|---|---|
| `{ "confidence": "high", "url": "https://…" }` | Saves the URL: `FOUND` / `AUTO` | `saved` |
| `{ "confidence": "low", "candidates": [{ "url", "page_title"?, "score"? }, …] }` (1 to 3, best first) | Does **not** save a URL. Status `NEEDS_REVIEW`, candidates stored (a new search replaces the old ones) | `needs_review` |
| `{ "confidence": "none" }` | Status `NOT_FOUND`, candidates cleared. Send this only when the search worked and found nothing usable, not when it failed | `no_match` |

- Automatic results are recorded as `REFRESH` (not as a person's edit) in `updated_by_type` and in the history.
- **A website that is already set is never replaced or cleared without confirmation.** Send `confirm_overwrite: true`,
  or the API answers 409 with the existing URL. This applies to the website endpoint, to discovery results and to
  `website_url` in the general organization edit. Finding the same URL again changes nothing.
- Sending the website an entity already has (`PUT .../website` or the general edit) leaves the URL as it is, but settles
  a pending review: status goes back to `FOUND` and the waiting suggestions are dropped.
- **Reject all suggestions:** `POST .../website/reject-candidates` clears the candidates. The entity keeps its website
  (`FOUND`) or, if it has none, becomes `NOT_FOUND`. Use it when a reviewer says "none of these is right".
- Entities that already had a website when `database_add_website_discovery.sql` was run are set to `FOUND` / `MANUAL`
  by the script itself (it only touches rows still at `NOT_SEARCHED`, so running it twice is safe).
- The previous URL stays in `record_history`.
- Review screen: `GET /api/organizations?website_status=NEEDS_REVIEW` lists the entities to review, with candidates and
  a `total`. Picking one is `PUT .../website` with its URL.

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

## AI use

- **AI used:** Yes.
- **Tool and model:** Claude Code (Sonnet 5.5).
- **How it was made:** written with AI help from Claude Code, directed by Irene Riva. Working from Irene's requests,
  Ryan's schema (`DataBase/database_schema.sql`) and Neon's documentation, Claude Code wrote the code in `backend/`
  (routes, validation, error handling, database helpers), the integration tests and this README. That includes the
  change from deleting records to flagging them, and for CHUD-30 the website endpoints with overwrite protection
  (`src/website.ts`). Irene directed the work, ran the API against a Neon dev branch, and checked the results by hand.
- **Peer review:** pending, in the pull request.

Every source file starts with a short AI-use note that points here.
