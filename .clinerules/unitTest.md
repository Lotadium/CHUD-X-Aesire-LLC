<!-- AI use: written with AI help from Claude Code (Sonnet 5.5), directed by Irene Riva. -->
# Tests ship with the change

- You must add or update a test in the same change whenever you add or change a function, hook, component or endpoint. Never finish a task without a test.
- Test behavior, not internals: assert what the user sees or what the function returns. A refactor must not break the tests.

## Frontend (frontend/)
- Use Vitest, React Testing Library and `@testing-library/user-event`. Put the test next to the source: `Thing.tsx` and `Thing.test.tsx`. Never add another test framework.
- Query by role, label or text (`getByRole`, `getByLabelText`), not by class names or test ids.
- Tests use the fake API. Never call the real backend or the network from a test.
- Before you say the work is done, run `npm run typecheck` and `npm test` in `frontend/` and report the result honestly, including failures.

## Backend (backend/)
- Tests use Node's built-in test runner (`node:test`) in `backend/test/`. Run `npm run typecheck` and `npm test` in `backend/`.
- API tests need a throwaway local Postgres through `TEST_DATABASE_URL`, and the database name must contain "test". Never point it at Neon. Without that variable the API tests are skipped, so say so when you report results.
- Tests must never call the real Brave search API or use search credit.
