# CHUD Frontend

React + TypeScript + Vite front end for the Client Tracking Information app.

## Run it

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm test           # unit and component tests
```

## Fake data or the real API

By default the app uses **fake in-memory data** (`src/lib/fakeApi.ts`), so it runs with no backend.

To use the real API from [`../backend`](../backend/README.md):

1. Start the backend (`cd backend && npm run local`).
2. Copy `.env.example` to `.env.local` (git-ignored) and set your name in `VITE_API_USER`.
3. Restart `npm run dev`.

## No deleting: records are flagged

Per the project charter (2.3 f.iv), there is no option to remove records. Instead, a record
that is no longer valid is **flagged** with a required reason. It stays in the database with
its history and can be unflagged. The real API stores this in the `is_flagged` and
`flag_reason` columns (database: CHUD-10, API: CHUD-13).
Clearing a contact's email also flags that email instead of deleting it.

## Look and feel

Styling follows the team's Figma mockups: colors and font live in `src/index.css`
(`@theme`), and shared pieces live in `src/components/ui.tsx`. Use those when building
new screens so everything matches.

## Layout

```
frontend/src/
  App.tsx                      shows the screen for the current address
  screens.tsx                  every screen and its address (add new screens here) CHUD-54
  components/
    OrganizationEditForm.tsx   edit + flag an organization (entity)     CHUD-15
    WebsiteStatus.tsx          saved website: link, source, last updated CHUD-31
    RefreshResultDialog.tsx    pop-up when a refresh finishes             CHUD-33
    ContactEditForm.tsx        edit + flag a contact                    CHUD-15
    ConfirmDialog.tsx          reusable "are you sure?" dialog (styled like the mockup pop-ups)
    FlagReasonField.tsx        required reason box in the flag dialog
    FormField.tsx              label + input/dropdown + inline error
    AppShell.tsx               black top bar from the Figma mockups, with the navigation menu CHUD-54
    ui.tsx                     page header, card, buttons, saved pill, error banner
  lib/
    validation.ts              Zod rules for organizations and contacts
    api.ts                     picks fakeApi or realApi
    fakeApi.ts                 in-memory sample data
    realApi.ts                 calls the backend; converts field names, ids, URLs
    refreshApi.ts              starts a refresh and runs it batch by batch (fake or real) CHUD-33;
                               reads a run's results and past runs                      CHUD-56
  pages/
    RefreshPage.tsx            Refresh page: button, progress bar, result pop-ups CHUD-33
    RefreshResultsPage.tsx     refresh results: counts, unverified records, fix by hand  CHUD-56
    ComingSoon.tsx             stands in for a menu screen that is not built yet CHUD-54
```

## Navigation (CHUD-54)

The menu in the top bar opens Records (`#/records`), Search (`#/search`), Review (`#/review`), Refresh
(`#/refresh`) and Activity log (`#/activity`). The current screen is highlighted, and the browser's back and
forward buttons work. Search and Review show a "not built yet" page until their screens exist. An empty or
unknown address opens Records.

To add a screen, add one line to `screens` in `src/screens.tsx` (plus its import):

```tsx
// In the menu: a name and an icon (an SVG path on a 16 x 16 grid)
{ path: "reports", label: "Reports", icon: "M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V6.5", render: () => <Reports /> },
// Opened from another screen: `under` is the menu item to highlight
{ path: "reports/:id", under: "Reports", render: (id) => <ReportPage id={id} /> },
```

## AI assistance

I (Kathleen Collier) used Claude Opus 5.5 (medium effort) as a learning and coding assistant on CHUD-15:

- **Zod validation:** Zod was new to me. Claude explained how schemas, `.refine()`, and
  regex checks work, and reviewed my validation code and tests while I wrote them.
- **Front-end styling:** Claude helped restyle the forms to match the Figma mockups
  approved by Aesire LLC.
- **Code and tests:** Claude generated parts of the forms, the flag confirmation dialog,
  the API client, and tests. I reviewed, ran, and tested all of it before committing.

Requirements, field decisions, team coordination, and final testing were done by me.

On CHUD-31 (show & edit website URL on the entity page), Claude Opus 5.5 wrote the
`WebsiteStatus` component, the website source/date mapping in `realApi.ts`, the fake data
changes, and the new tests.

On CHUD-64 (record page), I (Irene Riva) used two assistants. Cline with Gemini 3.5 Flash Lite
added `listContactsForOrganization` to `fakeApi.ts`, `realApi.ts`, `api.ts` and its test in `api.test.ts`.
Claude Code (Sonnet 5.5) wrote `RecordPage.tsx`, `RecordPage.test.tsx`, and the small changes to `App.tsx`
and `RecordsList.tsx`, after Cline's first version of the page did not compile and removed the entity route.
After Rachel's review, Claude Code also changed the real `listContactsForOrganization` to load every page of
contacts and use the position held at that organization, and wrote `realApi.contacts.test.ts`.
I reviewed, ran, and tested all of it.

On CHUD-57 (record history panel), I (Rachel) used two assistants. Cline with Gemini (3.5 Flash) wrote the real
`getOrganizationHistory` in `realApi.ts` and its test in `realApi.test.ts`. Claude Code (Opus 5.5) wrote everything
else: `RecordHistory.tsx`, `lib/recordHistory.ts`, `getOrganizationHistory` in `fakeApi.ts` and `api.ts`, the
`#/activity/<id>` route in `App.tsx`, the `organizationId` prop on `ActivityLog.tsx`, and the tests
(`RecordHistory.test.tsx`, `recordHistory.test.ts`, and new tests in `RecordPage.test.tsx` and `ActivityLog.test.tsx`).
I reviewed, ran, and tested all of it.

On CHUD-54 (navigation menu), I (Ryan Griffiths) used Claude Code (Opus 5.5). It wrote `screens.tsx`,
`ComingSoon.tsx`, `App.test.tsx` and `AppShell.test.tsx`, and the menu changes to `App.tsx`, `AppShell.tsx` and
`RecordPage.test.tsx`. When `main` was merged in, it also moved the CHUD-56 and CHUD-57 routes into `screens.tsx` and
combined the CHUD-56 `AppShell.test.tsx` with the CHUD-54 one.

## Record page (CHUD-64)

`#/records/<id>` opens one organization (click an entity name in the records list). It is read-only:

- the organization's name, domain, website (same box as the entity page) and when it was last updated
  and last verified, with a **Verified** pill (or **Flagged as no longer valid**)
- its contacts: name, title, email and phone. A blank value reads "Not Found". A name opens the
  contact form (`#/contact/<id>`)
- **Edit** opens the entity form (`#/entity/<id>`); **Refresh** runs a refresh for just this record
  (`startRefresh([id])`, then `nextRefreshBatch` until it is done) and shows the result
- the **Record history** panel (CHUD-57, below)

Contacts come from `listContactsForOrganization(orgId)` in `lib/api.ts` (fake data, or
`GET /api/people?organization_id=<id>` with `VITE_USE_REAL_API=true`).

### Record history panel (CHUD-57)

The last card on the record page (`components/RecordHistory.tsx`, charter 2.3 c) shows:

- when the record was **last updated**
- every saved version, newest first (the newest is marked **Current**): the date, who changed it
  (a username, or **Refresh** for the data refresh) and what changed ("Website: Not Found → https://…").
  Version 1 reads "Record created"
- **No earlier versions** when the record has only the version it was created with
- **Open activity log for this record**, which opens `#/activity/<id>`: the activity log with the
  Entity filter already set to this organization

Versions come from `getOrganizationHistory(id)` in `lib/api.ts`: fake sample data (organization 1 has
versions, organization 2 has none; saving the entity form adds one), or `GET /api/organizations/:id/history`
(CHUD-36) with `VITE_USE_REAL_API=true`. The panel shows the organization's own versions; contact changes
are on each contact's history and in the activity log. The wording of each change is in `lib/recordHistory.ts`.

## Website on the entity page (CHUD-31)

The entity page shows the website that is **saved**, separate from the Website URL box being
edited:

- a link that opens in a new tab, or "No website yet" ("No website found by search" if
  discovery came up empty)
- whether it was **found automatically** by website discovery or **entered manually**
- when the website was last updated
- a **Needs review** badge when discovery left suggestions waiting (Jaden's review screen, CHUD-50)

These come from the website fields in Irene's API (CHUD-30): `website_source` (`AUTO` / `MANUAL`),
`website_updated_at`, `website_status` and `website_candidates`.

**Replacing or removing a saved website asks first.** The API refuses to change a website that is
already set unless the request says `confirm_overwrite: true` (it answers 409 otherwise). So when
the box no longer matches the saved website, the form shows "Replace the website on file?" (or
"Remove…") and only sends `confirm_overwrite` after the user says yes. Typing the same site with or
without `https://` counts as no change. The fake API follows the same rule.

## Refresh page (CHUD-33)

The Refresh tab follows the "Screen 2 - Refresh" mockups:

- **Refresh** starts a run. While it runs, the button reads "Refreshing…", the "Missing information?"
  form is greyed out, and a progress bar shows "X of N records processed" and the percent done.
  The browser warns before closing the tab mid-run.
- When it finishes, a pop-up shows either **"All N records verified"** (Done) or **"N records couldn't
  be verified"** with the first 5 and their reasons, "+ N more", and **Review records**.
- Review records shows the records that need attention. The list and the "Search + Update" form are
  Jaden's task (CHUD-37); `state.progress.unverified` in `RefreshPage.tsx` has the records and reasons.
- If a batch fails, the page shows the error and how many records were done, with **Continue refresh**
  (same run, nothing redone) or **Start over**. No stuck progress bar.

**How it talks to the API.** It uses Irene's refresh endpoint (CHUD-35, "Data refresh" in
`backend/README.md`). Cloudflare Workers can't run one long request for every record, so the page drives
the run a few records at a time:

| Method | Path | What the page does with it |
|---|---|---|
| POST | `/api/refresh` with `{ "all": true }` | Starts the run and shows "0 of N records processed" |
| POST | `/api/refresh/:id/process` | Called again and again; each answer moves the progress bar. Stops when `status` is `COMPLETE` |

The pop-up uses `verified`, `updated` ("5 with new details saved") and `unverified_records`. Each
`reason_code` gets a short label for the pop-up (`CONTACT_NOT_LISTED` becomes "contact not found"; the list
is in `refreshApi.ts`), and the backend's full `reason` shows when you hover over the line. CHUD-37 gets both.

`refreshApi.ts` uses a fake run (50 records, 7 that can't be verified) unless `VITE_USE_REAL_API=true` is
set in `.env.local`, the same switch as the rest of the app.

On CHUD-33, Claude Opus 5.5 wrote the Refresh page, the result pop-up, the refresh API client with its
fake run, and the tests, and checked the page end to end against the CHUD-35 backend on a local database.

## Refresh results (CHUD-56)

After a refresh, staff see what it found and fix the records it couldn't verify (Charter 2.3 c).
The **Refresh** tab in the black top bar opens the Refresh page and is underlined on it and on the results.
Open the results with **View full results** on the finished Refresh card, or **See the last refresh's results**
before starting one. Addresses: `#/refresh/<run id>`, or `#/refresh/latest` for the most recent run.

- **Counts:** records checked, verified, updated and couldn't be verified, taken as is from the API's
  run summary, so they always match what the backend recorded. A run that didn't finish says how far it got.
- **Records that need attention:** each one with its reason (the short label and the backend's full
  reason), and "Some new details were still saved" when `changed` is true. A **Reason** filter appears
  when there is more than one reason.
- **Fixing a record:** **Open record** goes to the record page (CHUD-64), **Update by hand** to the
  entity form. After a fix, **Check again** refreshes just that record; it turns to "Verified now" or
  says why it still can't be verified.
- **Recent refreshes:** the last 5 runs with their counts, each linking to its results.

| Method | Path | Used for |
|---|---|---|
| GET | `/api/refresh/:id` | The run's counts and unverified records (does no work) |
| GET | `/api/refresh?limit=5` | Recent refreshes, and the newest one for `#/refresh/latest` |
| POST | `/api/refresh` with `{ "organization_ids": [id] }`, then `/process` | **Check again** for one record |

The fake API starts with one finished 50-record run, so the screen has something to show before anyone
runs a refresh. Its unverified records use ids that aren't in the fake records, so **Open record** only
shows real records when `VITE_USE_REAL_API=true`.

On CHUD-56, Claude Opus 5.5 wrote the results page, the new functions in `refreshApi.ts` with their fake
versions, the links on the Refresh page, the top bar's Refresh link, the `App.tsx` route and the tests, and checked the screen end to end
against the CHUD-35 backend on a local database (refresh, update a record by hand, check it again).
