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

## Layout

```
frontend/src/
  components/
    OrganizationEditForm.tsx   edit + delete an organization (entity)   CHUD-15
    ContactEditForm.tsx        edit + delete a contact                  CHUD-15
    ConfirmDialog.tsx          reusable "are you sure?" dialog
    FormField.tsx              label + input + inline error
  lib/
    validation.ts              Zod rules for organizations and contacts
    api.ts                     picks fakeApi or realApi
    fakeApi.ts                 in-memory sample data
    realApi.ts                 calls the backend; converts field names, ids, URLs
```
