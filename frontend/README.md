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

## Look and feel

Styling follows the team's Figma mockups: colors and font live in `src/index.css`
(`@theme`), and shared pieces live in `src/components/ui.tsx`. Use those when building
new screens so everything matches.

## Layout

```
frontend/src/
  components/
    OrganizationEditForm.tsx   edit + delete an organization (entity)   CHUD-15
    ContactEditForm.tsx        edit + delete a contact                  CHUD-15
    ConfirmDialog.tsx          reusable "are you sure?" dialog (styled like the mockup pop-ups)
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
- **Code and tests:** Claude generated parts of the forms, the delete confirmation dialog,
  the API client, and tests. I reviewed, ran, and tested all of it before committing.

Requirements, field decisions, team coordination, and final testing were done by me.
