// AI use: written with AI help from Claude Code (Opus 5.5), directed by Ryan Griffiths. See "AI use" in backend/README.md.
// Tests for the website discovery search (CHUD-29) and the search -> ranking -> save hand-off
// (CHUD-48 -> CHUD-30). The Brave API is always mocked: `fetch` is replaced in every test, and
// test/setup.ts points the provider at a fake key and an endpoint that can never resolve.
// No database or network needed: the search route gets a fake pool (see fakePool).
import "./setup.ts"; // must come first: src/search.ts reads the Brave settings when it is imported
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import pg from "pg";
import { createApp } from "../src/app.ts";
import { rankResults } from "../src/ranking/rank.ts";
import { Brave } from "../src/search.ts";
import type { SearchResults } from "../src/search/provider.ts";
import { queryBuilder } from "../src/search/query.ts";
import { parseDiscovery } from "../src/website.ts";
import { SAMPLES } from "./fixtures/search-results.ts";

type FetchCall = { url: string; init: RequestInit };

/**
 * Replace fetch with a fake Brave API that answers with `results` (or an HTTP error) and records each call.
 * Errors come back in Brave's JSON error format, which src/search.ts reads for the error message.
 */
function mockBrave(answer: SearchResults | { status: number }) {
  const calls: FetchCall[] = [];
  mock.method(globalThis, "fetch", async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    if ("status" in answer) {
      return Response.json(
        {
          type: "ErrorResponse",
          time: 0,
          error: { id: "test", status: answer.status, code: "RATE_LIMITED", detail: "Request rate limit exceeded", meta: {} },
        },
        { status: answer.status, statusText: "Too Many Requests" },
      );
    }
    return Response.json({ web: { results: answer } });
  });
  return calls;
}

/**
 * A stand-in for the database pool: the search route only writes one row to web_search_log
 * per search (CHUD-49), so this records the SQL instead of needing a database.
 */
function fakePool() {
  const queries: { text: string; values?: unknown[] }[] = [];
  const pool = {
    async query(text: string, values?: unknown[]) {
      queries.push({ text, values });
      return { rows: [], rowCount: 0 };
    },
  };
  return { pool: pool as unknown as pg.Pool, queries };
}

// Anything that reaches fetch without mockBrave fails loudly instead of going out to the internet.
beforeEach(() => {
  mock.method(globalThis, "fetch", async (url: string | URL) => {
    throw new Error(`unexpected network call in a test: ${String(url)}`);
  });
});
afterEach(() => mock.restoreAll());

describe("queryBuilder", () => {
  it("joins the person, job and place into one escaped query", () => {
    const query = queryBuilder(
      {
        firstName: "Ana",
        lastName: "Lopez",
        title: "Fire Chief",
        organizationName: "Contra Costa County Fire Protection District",
        city: "Concord",
        state: "CA",
        county: "Contra Costa",
      },
      Brave.Operators,
    );
    assert.equal(
      decodeURIComponent(query),
      "Ana Lopez Fire Chief Contra Costa County Fire Protection District Concord, CA, Contra Costa county",
    );
  });

  it("limits the search to the entity's domain when one is known", () => {
    const query = queryBuilder({ firstName: "Ana", lastName: "Lopez", organizationDomain: "cccfpd.org" }, Brave.Operators);
    assert.equal(decodeURIComponent(query), "Ana Lopez site:cccfpd.org");
  });
});

describe("Brave provider (mocked)", () => {
  const sample = SAMPLES[0].results;

  it("never uses the real key or endpoint in tests", () => {
    assert.equal(Brave.endpoint, "https://brave-search.invalid/res/v1/web/search");
    assert.equal(Brave.RequestHeaders.get("X-Subscription-Token"), "test-key");
  });

  it("sends the query and limit to the endpoint and returns the results", async () => {
    const calls = mockBrave(sample);
    const results = await Brave.search("contra costa fire", { limit: 10, safesearch: false });

    assert.deepEqual(results, sample);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, Brave.endpoint);
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.q, "contra costa fire");
    assert.equal(body.count, 10);
  });

  it("throws with Brave's status, code and message when the API answers with an error", async () => {
    mockBrave({ status: 429 });
    await assert.rejects(
      Brave.search("anything", { limit: 10, safesearch: false }),
      /Request Error 429 \(RATE_LIMITED\): Request rate limit exceeded/,
    );
  });
});

describe("POST /api/web-search (mocked)", () => {
  const { pool, queries } = fakePool();
  const app = createApp(pool);
  beforeEach(() => {
    queries.length = 0;
  });
  const search = (body: unknown) =>
    app.request("/api/web-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("returns the search results", async () => {
    const sample = SAMPLES[2].results;
    const calls = mockBrave(sample);
    const res = await search({ firstName: "Ana", lastName: "Lopez", organizationName: "City of Sacramento" });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), sample);
    assert.equal(calls.length, 1);
    assert.equal(JSON.parse(String(calls[0].init.body)).count, 10);
  });

  it("logs each search for the monthly usage count (CHUD-49)", async () => {
    mockBrave(SAMPLES[2].results);
    await app.request("/api/web-search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-User": "ryan" },
      body: JSON.stringify({ firstName: "Ana", lastName: "Lopez" }),
    });

    assert.equal(queries.length, 1);
    assert.match(queries[0].text, /INSERT INTO web_search_log/);
    assert.deepEqual(queries[0].values, [null, "brave", "ryan"]);
  });

  it("rejects a request without a first and last name, without searching", async () => {
    const calls = mockBrave([]);
    const res = await search({ organizationName: "City of Sacramento" });

    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /firstName, lastName/);
    assert.equal(calls.length, 0, "no search credit used");
    assert.equal(queries.length, 0, "nothing logged");
  });

  it("returns 500 when the search provider fails", async () => {
    mockBrave({ status: 429 });
    const res = await search({ firstName: "Ana", lastName: "Lopez" });

    assert.equal(res.status, 500);
    assert.match((await res.json()).error, /Failed to access search provider API/);
  });
});

describe("search -> ranking -> discovery body (mocked)", () => {
  // What CHUD-30 accepts at POST /organizations/:id/website/discovery.
  for (const sample of SAMPLES) {
    it(`${sample.type}: the ranking result is a valid discovery request`, async () => {
      mockBrave(sample.results);
      const results = await Brave.search("query", { limit: 10, safesearch: false });
      const discovery = parseDiscovery(rankResults(results, sample.entity));

      assert.equal(discovery.confidence, sample.expect);
      if (sample.expect === "high") assert.equal(discovery.url, sample.official);
      else assert.ok(discovery.candidates.length >= 1 && discovery.candidates.length <= 3);
    });
  }

  it("a search with no results becomes a valid 'none' request", async () => {
    mockBrave([]);
    const results = await Brave.search("query", { limit: 10, safesearch: false });
    assert.equal(parseDiscovery(rankResults(results, { name: "Nowhere District" })).confidence, "none");
  });
});
