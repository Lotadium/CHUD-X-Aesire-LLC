// AI use: written with AI help from Claude Code (Opus 5.5), directed by Ryan Griffiths. See "AI use" in backend/README.md.
// Tests for the website discovery search (CHUD-29) and the search -> ranking -> save hand-off
// (CHUD-48 -> CHUD-30). The Brave API is always mocked: `fetch` is replaced in every test, and
// test/setup.ts points the provider at a fake key and an endpoint that can never resolve.
// No database or network needed.
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

/** Replace fetch with a fake Brave API that answers with `results` (or an HTTP error) and records each call. */
function mockBrave(answer: SearchResults | { status: number }) {
  const calls: FetchCall[] = [];
  mock.method(globalThis, "fetch", async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    if ("status" in answer) return new Response("", { status: answer.status, statusText: "Too Many Requests" });
    return Response.json({ web: { results: answer } });
  });
  return calls;
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

  it("throws when the API answers with an error", async () => {
    mockBrave({ status: 429 });
    await assert.rejects(Brave.search("anything", { limit: 10, safesearch: false }), /429/);
  });
});

describe("POST /api/web-search (mocked)", () => {
  // The search route never touches the database, so the pool is never connected.
  const pool = new pg.Pool({ connectionString: "postgres://unused.invalid/test" });
  const app = createApp(pool);
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

  it("rejects a request without a first and last name, without searching", async () => {
    const calls = mockBrave([]);
    const res = await search({ organizationName: "City of Sacramento" });

    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /firstName, lastName/);
    assert.equal(calls.length, 0, "no search credit used");
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
