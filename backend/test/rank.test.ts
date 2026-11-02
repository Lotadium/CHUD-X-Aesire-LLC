// AI use: written with AI help from Claude Code (Opus 5.5), directed by Ryan Griffiths. See "AI use" in backend/README.md.
// Unit tests for the website ranking rules (CHUD-48). No database or network needed.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HIGH_SCORE, rankResults, scoreCandidate, type RankContext } from "../src/ranking/rank.ts";

const result = (url: string, title: string) => ({ url, title, description: "" });

const sanMateo: RankContext = { name: "County of San Mateo", county: "San Mateo" };
const lausd: RankContext = { name: "Los Angeles Unified School District", county: "Los Angeles" };

describe("scoreCandidate", () => {
  it("scores an official .gov site with the name in title and domain highly", () => {
    const score = scoreCandidate(result("https://www.sanmateocounty.gov/", "County of San Mateo"), sanMateo);
    assert.ok(score >= HIGH_SCORE, `score was ${score}`);
  });

  it("recognises an acronym domain", () => {
    const withAcronym = scoreCandidate(result("https://www.lausd.net/", "Home - LAUSD"), lausd);
    const without = scoreCandidate(result("https://www.example.net/", "Home"), lausd);
    assert.ok(withAcronym > without);
  });

  it("prefers .gov over .org over .com, all else equal", () => {
    const title = "Board of Supervisors";
    const gov = scoreCandidate(result("https://example.gov/", title), sanMateo);
    const org = scoreCandidate(result("https://example.org/", title), sanMateo);
    const com = scoreCandidate(result("https://example.com/", title), sanMateo);
    assert.ok(gov > org && org > com, `${gov} ${org} ${com}`);
  });

  it("counts .ca.gov once, as a .gov domain", () => {
    const caGov = scoreCandidate(result("https://example.ca.gov/", "Home"), sanMateo);
    const gov = scoreCandidate(result("https://example.gov/", "Home"), sanMateo);
    assert.equal(caGov, gov);
  });

  it("adds points for the county name and district keywords", () => {
    const withCounty = scoreCandidate(result("https://example.org/", "San Mateo water district"), { name: "Water Agency", county: "San Mateo" });
    const without = scoreCandidate(result("https://example.org/", "water"), { name: "Water Agency", county: "San Mateo" });
    assert.ok(withCounty > without);
  });

  it("keeps known non-official sites low even when the name matches", () => {
    for (const url of [
      "https://en.wikipedia.org/wiki/San_Mateo_County,_California",
      "https://www.facebook.com/sanmateocounty",
      "https://www.yelp.com/biz/county-of-san-mateo",
      "https://www.latimes.com/county-of-san-mateo",
    ]) {
      assert.ok(scoreCandidate(result(url, "County of San Mateo"), sanMateo) <= 5, url);
    }
  });

  it("gives 0 to a URL that cannot be parsed", () => {
    assert.equal(scoreCandidate(result("not a url", "County of San Mateo"), sanMateo), 0);
  });
});

describe("rankResults", () => {
  it("returns high confidence for a clear official winner", () => {
    const ranked = rankResults(
      [
        result("https://en.wikipedia.org/wiki/San_Mateo_County,_California", "San Mateo County - Wikipedia"),
        result("https://www.sanmateocounty.gov/", "County of San Mateo"),
        result("https://www.facebook.com/sanmateocounty", "County of San Mateo | Facebook"),
      ],
      sanMateo,
    );
    assert.deepEqual(ranked, { confidence: "high", url: "https://www.sanmateocounty.gov/" });
  });

  it("is not thrown off by several pages of the same site", () => {
    const ranked = rankResults(
      [
        result("https://www.sanmateocounty.gov/", "County of San Mateo"),
        result("https://www.sanmateocounty.gov/departments", "Departments | County of San Mateo"),
      ],
      sanMateo,
    );
    assert.equal(ranked.confidence, "high");
  });

  it("flags only non-official sites as low confidence, with the top 3", () => {
    const ranked = rankResults(
      [
        result("https://en.wikipedia.org/wiki/San_Mateo_County", "San Mateo County - Wikipedia"),
        result("https://www.facebook.com/sanmateocounty", "County of San Mateo"),
        result("https://www.yelp.com/biz/san-mateo-county", "San Mateo County"),
        result("https://www.linkedin.com/company/san-mateo-county", "San Mateo County"),
      ],
      sanMateo,
    );
    assert.equal(ranked.confidence, "low");
    assert.ok(ranked.confidence === "low" && ranked.candidates.length === 3);
  });

  it("flags two strong sites that are too close to call", () => {
    const ranked = rankResults(
      [
        result("https://www.sanmateocounty.gov/", "County of San Mateo"),
        result("https://www.sanmateocounty.ca.gov/", "County of San Mateo"),
      ],
      sanMateo,
    );
    assert.equal(ranked.confidence, "low");
  });

  it("tells the county apart from the city of the same name", () => {
    const ranked = rankResults(
      [
        result("https://www.cityofsanmateo.gov/", "City of San Mateo"),
        result("https://www.sanmateocounty.gov/", "County of San Mateo"),
      ],
      sanMateo,
    );
    assert.deepEqual(ranked, { confidence: "high", url: "https://www.sanmateocounty.gov/" });
  });

  it("does not save a weak best match without review", () => {
    const ranked = rankResults([result("https://example.com/", "Welcome")], sanMateo);
    assert.equal(ranked.confidence, "low");
  });

  it("sorts review candidates best first and drops duplicate URLs", () => {
    const ranked = rankResults(
      [
        result("https://example.com/", "Something else"),
        result("https://smc.example.org/", "County of San Mateo"),
        result("https://example.com/", "Something else"),
      ],
      sanMateo,
    );
    assert.ok(ranked.confidence === "low");
    assert.deepEqual(ranked.candidates.map((c) => c.url), ["https://smc.example.org/", "https://example.com/"]);
    assert.ok(ranked.candidates[0].score >= ranked.candidates[1].score);
  });

  it("returns none when there is nothing usable", () => {
    assert.deepEqual(rankResults([], sanMateo), { confidence: "none" });
    assert.deepEqual(rankResults([result("ftp://example.gov/", "County of San Mateo")], sanMateo), { confidence: "none" });
  });
});
