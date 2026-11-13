<!-- AI use: written with AI help from Claude Code (Sonnet 5.5), directed by Irene Riva. -->
# Frontend API layer (frontend/src/lib/)

Screens never call `fetch` directly and never import `fakeApi.ts` or `realApi.ts` directly.

- You must import data functions from `frontend/src/lib/api.ts` only. It picks the fake API (sample data, the default) or the real backend (`VITE_USE_REAL_API=true` in `.env.local`).
- When you add a data function, you must add it to BOTH `fakeApi.ts` and `realApi.ts` with the same name, arguments and return type, then re-export it from `api.ts`. The two must behave the same, including errors and validation.
- Build a new screen against the fake API first so it works before its backend exists. Check `backend/README.md` for the real endpoint, its fields and its error format (`{ error, fields? }`) before writing `realApi.ts`.
- The real API's base URL comes from the environment. Never hard-code a URL, key or token.
- Handle loading, empty and error states in every screen that fetches data.
