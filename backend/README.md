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

All the tests run with one command, `npm test`. The unit tests need nothing else; the API tests are skipped unless
`TEST_DATABASE_URL` is set (see below).

| File | What it tests | Needs |
|------|---------------|-------|
| `test/rank.test.ts` | Website ranking (CHUD-48): official site chosen, directory/news/social sites ranked low, low-confidence results flagged, using sample results for a fire district, water district, city, county agency and special district (`test/fixtures/search-results.ts`) | nothing |
| `test/search.test.ts` | Web search (CHUD-29) with the Brave API mocked: query building, the `/api/web-search` route, and that the ranking result is a valid discovery request for CHUD-30 | nothing |
| `test/refresh.test.ts` | The data refresh (CHUD-35) with the web search and contact lookup replaced by fakes: matching rules, updating in place without duplicates, verified/unverified reasons, one failure not stopping a run, batches and progress | `TEST_DATABASE_URL` for the API part (the matching rules need nothing) |
| `test/api.test.ts` | The whole API, including saving discovery results (CHUD-30): high confidence saves, low confidence goes to review, an existing URL is not overwritten without confirmation | `TEST_DATABASE_URL` |

**The tests never call the real Brave API or use search credit.** `npm test` loads `test/setup.ts` first, which
replaces `BRAVE_API_KEY` and `BRAVE_SEARCH_ENDPOINT` with fake values (even if real ones are set), and the search
tests mock `fetch`; an unmocked network call fails the test.

The API tests run against a **throwaway local Postgres** built from the schema files in `DataBase/` (the base schema, then the
flag, website-discovery, search-usage and refresh add-ons). They wipe the
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
- Sending the website an entity already has with `PUT .../website` leaves the URL as it is, but settles a pending
  review: status goes back to `FOUND` and the waiting suggestions are dropped. The general organization edit does
  **not** do this, because a form sends the website on every save: renaming an entity that is waiting for review
  leaves its review alone.
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

## Data refresh (CHUD-35)

A refresh checks records against their websites and updates them **in place**. It works through the chosen records
one at a time, a few per request, because the front end polls for progress (the progress bar, CHUD-33) and every
request has a time limit. Tables: `DataBase/database_add_refresh.sql` (`refresh_run`, `refresh_item`; run it after
`database_add_search_usage.sql`; safe to run more than once).

| Endpoint | What it does |
|---|---|
| `POST /api/refresh` | Starts a run. Body: exactly one of `{ "organization_ids": [1, 2] }`, `{ "domain_id": 3 }` or `{ "all": true }`. Does no work yet; returns the run (201). Flagged records are never included |
| `POST /api/refresh/:id/process` | Does the next records of the run. Optional body `{ "batch_size": 3 }` (1 to 10; default 3). Stops early after `REFRESH_TIME_BUDGET_MS` (default 20000). Call it again until `status` is `COMPLETE`. Safe to repeat: finished records are not redone |
| `GET /api/refresh/:id` | Progress and summary, without doing any work |
| `GET /api/refresh` | Past runs, newest first (`limit`, `offset`), each with its counts: how many refreshes were done, by whom, and how they went |

Every response is the same summary:

```json
{ "run_id": 7, "status": "RUNNING", "total": 40, "processed": 12, "percent_complete": 30,
  "verified": 9, "unverified": 3, "updated": 5,
  "unverified_records": [{ "organization_id": 5, "name": "City of Alpha", "reason_code": "CONTACT_NOT_LISTED",
                           "reason": "Sam Lee: Requested contact was not found on the crawled pages", "changed": false }],
  "requested_by": "irene", "created_at": "…", "finished_at": null }
```

The progress bar is `processed / total` ("10 of 50 records processed, 20%": `percent_complete`). Once `COMPLETE`, the
finish message is `verified`, `updated` (records where the refresh saved a change: a new website or new contact details)
and `unverified`, with the `unverified_records` listed. A record can be unverified and still `changed: true` when the
details it did find were saved.

**For each record:**

1. If it has no website, search for one (CHUD-29), rank the results (CHUD-48) and save the result as in CHUD-30:
   a confident match is saved as an automatic change; a low-confidence one goes to the review list and the record is
   unverified (`WEBSITE_NEEDS_REVIEW`). Each search is counted toward the monthly usage (CHUD-49), and no search is made
   once `WEB_SEARCH_MONTHLY_LIMIT` is reached (`SEARCH_LIMIT_REACHED`).
2. Look up each contact we already have there (people with a position at this record, not flagged) on the website (CHUD-34).
3. Compare and write **only what changed**, in one transaction:
   - Title and phone go on the person's position. A phone number in another format ("(916) 555-0100" vs
     "+1-916-555-0100") is not a change. A value the website does not show is never blanked. A phone is saved only if
     it has exactly 10 digits (charter 2.3 e.iv); anything else counts as not found.
   - Email: an address we already have is left alone. If the contact has exactly one email and the website shows a
     different one, that row is updated (the old address stays in `record_history`). If the contact has none or
     several, the new address is added. An address that already belongs to **another** contact is never moved; it is
     reported as `EMAIL_BELONGS_TO_OTHER_CONTACT`.
   - Rows are never added for contacts we already have, and no entity is added. **Adding contacts the website lists
     that we do not have is out of scope** (the lookup works from a known name).
   - Every change is recorded as made by the refresh (`updated_by_type` `REFRESH`, shown in `record_history`), with the
     requester's `X-User` as `updated_by`. Rows the refresh confirmed get `last_verified_at`.
4. The record is **verified** when it has a website and every contact was found on it with at least one detail.
   Otherwise it is **unverified** with a `reason_code` (`NO_WEBSITE_FOUND`, `WEBSITE_NEEDS_REVIEW`, `SEARCH_FAILED`,
   `SEARCH_LIMIT_REACHED`, `SITE_UNREACHABLE`, `CONTACT_NOT_LISTED`, `NO_CONTACT_DATA`,
   `EMAIL_BELONGS_TO_OTHER_CONTACT`, `LOOKUP_UNAVAILABLE`, `RECORD_UNAVAILABLE`, `ERROR`) and a reason in words.
   Details found for the other contacts are still saved.

**One failed record never stops the run:** any error is caught, the record is reported as unverified (`ERROR`), and
the next one starts. Two requests polling at once never process the same record (each record is claimed by a single
statement), and a record claimed by a request that died is picked up again after 5 minutes.

The web search and the contact lookup are passed to `createApp(pool, deps)` (`src/refresh/types.ts`), so tests use
fakes. The real ones are in `src/refresh/providers.ts`.

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
  src/ranking/rank.ts  scores web search results and picks the official website (CHUD-48)
  src/refresh/         data refresh (CHUD-35): the run engine, contact matching, the real search/lookup services
  src/routes/refresh.ts  the /api/refresh endpoints
  test/api.test.ts     integration tests
  test/rank.test.ts    unit tests for the ranking rules
  test/refresh.test.ts tests for the data refresh
  test/search.test.ts  web search tests with the Brave API mocked
  test/setup.ts        fake Brave settings, loaded before every test file
  test/fixtures/       sample search results for each entity type
```

## AI use

- **AI used:** Yes.
- **Tool and model:** Claude Code (Sonnet 5.5; Opus 5.5 for CHUD-48 and CHUD-32).
- **How it was made:** written with AI help from Claude Code, directed by Irene Riva. Working from Irene's requests,
  Ryan's schema (`DataBase/database_schema.sql`) and Neon's documentation, Claude Code wrote the code in `backend/`
  (routes, validation, error handling, database helpers), the integration tests and this README. That includes the
  change from deleting records to flagging them, and for CHUD-30 the website endpoints with overwrite protection
  (`src/website.ts`). Irene directed the work, ran the API against a Neon dev branch, and checked the results by hand.

  For CHUD-48, directed by Ryan Griffiths: working from the ticket's acceptance criteria, the CHUD-29 search code
  (`src/search/`) and the CHUD-30 discovery endpoint, Claude Code wrote the ranking rules in `src/ranking/rank.ts`
  and the unit tests in `test/rank.test.ts`, and reviewed the project `.gitignore`. Ryan set the requirements,
  reviewed the code, and ran the type check and unit tests; the scoring weights and thresholds still need tuning
  against real search results.

  For CHUD-32, directed by Ryan Griffiths: Claude Code wrote the test setup, sample search results and the search and
  ranking tests (`test/`) and the "Test it" docs. Ryan reviewed them and ran `npm test`.

  For CHUD-35, directed by Irene Riva: working from the ticket's acceptance criteria and the existing CHUD-13, 29,
  30, 48 and 49 code, Claude Code wrote the refresh (`src/refresh/`, `src/routes/refresh.ts`,
  `DataBase/database_add_refresh.sql`), its tests (`test/refresh.test.ts`) and the section above. Irene directed the
  work and decided its scope (existing contacts only); the matching rules for emails are a design choice that still
  needs a teammate's review.
- **Peer review:** pending, in the pull request.

Every source file starts with a short AI-use note that points here.
