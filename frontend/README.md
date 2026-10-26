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
  components/
    OrganizationEditForm.tsx   edit + flag an organization (entity)     CHUD-15
    WebsiteStatus.tsx          saved website: link, source, last updated CHUD-31
    ContactEditForm.tsx        edit + flag a contact                    CHUD-15
    ConfirmDialog.tsx          reusable "are you sure?" dialog (styled like the mockup pop-ups)
    FlagReasonField.tsx        required reason box in the flag dialog
    FormField.tsx              label + input/dropdown + inline error
    AppShell.tsx               black top bar from the Figma mockups (tabs are placeholders)
    ui.tsx                     page header, card, buttons, saved pill, error banner
  lib/
    validation.ts              Zod rules for organizations and contacts
    api.ts                     picks fakeApi or realApi
    fakeApi.ts                 in-memory sample data
    realApi.ts                 calls the backend; converts field names, ids, URLs
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

## Website on the entity page (CHUD-31)

The entity page shows the website that is **saved**, separate from the Website URL box being
edited: a link that opens in a new tab (or "No website yet"), whether it was **found
automatically** by website discovery or **entered manually**, and when it was last updated.

The API doesn't send a website-only source and date yet. Until it does, `realApi.ts` uses the
whole row's `updated_by_type` (`REFRESH` = found automatically, `USER` = entered manually) and
`date_last_updated`. This is approximate, because editing the name also changes them. When the
API adds `website_source` (`"auto"` / `"manual"`) and `website_updated_at` (proposed for
CHUD-30), the page uses those automatically.
