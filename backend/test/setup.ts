// AI use: written with AI help from Claude Code (Opus 5.5), directed by Ryan Griffiths. See "AI use" in backend/README.md.
// Loaded before every test file (`node --import ./test/setup.ts`, see package.json).
//
// src/search.ts reads the Brave settings as soon as it is imported, and the app imports it.
// The tests always use these fake values, even when real ones are set, so they never call
// the real Brave API or use up credit. The .invalid domain can never resolve, and tests that
// search mock `fetch` (test/search.test.ts).
process.env.BRAVE_API_KEY = "test-key";
process.env.BRAVE_SEARCH_ENDPOINT = "https://brave-search.invalid/res/v1/web/search";
