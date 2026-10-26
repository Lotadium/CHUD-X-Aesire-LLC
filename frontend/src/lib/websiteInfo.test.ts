// How realApi.ts reads the website fields from Irene's CHUD-30 API (CHUD-31).
import { test, expect } from "vitest";
import { toWebsiteInfo } from "./realApi";
import { sameWebsite } from "./website";

const base = { organization_id: 1, domain_id: 1, name: "Sacramento Metro Fire" };

test("reads the API's uppercase source as 'auto' / 'manual'", () => {
  expect(toWebsiteInfo({
    ...base,
    website_url: "https://metrofire.ca.gov/",
    website_status: "FOUND",
    website_source: "AUTO",
    website_updated_at: "2026-10-20T19:00:00Z",
    website_candidates: [],
  })).toEqual({ websiteSource: "auto", websiteUpdatedAt: "2026-10-20T19:00:00Z", websiteStatus: "FOUND", websiteSuggestions: 0 });
  expect(toWebsiteInfo({ ...base, website_url: "https://metrofire.ca.gov/", website_source: "MANUAL" }).websiteSource).toBe("manual");
});

test("counts suggestions waiting for review", () => {
  const info = toWebsiteInfo({
    ...base,
    website_url: null,
    website_status: "NEEDS_REVIEW",
    website_candidates: [
      { url: "https://metrofire.ca.gov", page_title: "Metro Fire" },
      { url: "https://metrofire.org", page_title: null },
    ],
  });
  expect(info).toEqual({ websiteSource: "", websiteUpdatedAt: "", websiteStatus: "NEEDS_REVIEW", websiteSuggestions: 2 });
});

test("an older API without the website fields still works", () => {
  expect(toWebsiteInfo({ ...base, website_url: "https://metrofire.ca.gov/" }))
    .toEqual({ websiteSource: "", websiteUpdatedAt: "", websiteStatus: "", websiteSuggestions: 0 });
});

test("sameWebsite treats a missing https:// as the same site", () => {
  expect(sameWebsite("metrofire.ca.gov", "https://metrofire.ca.gov")).toBe(true);
  expect(sameWebsite(" https://metrofire.ca.gov ", "https://metrofire.ca.gov")).toBe(true);
  expect(sameWebsite("", "")).toBe(true);
  expect(sameWebsite("", "https://metrofire.ca.gov")).toBe(false);
  expect(sameWebsite("https://metrofire.org", "https://metrofire.ca.gov")).toBe(false);
});
