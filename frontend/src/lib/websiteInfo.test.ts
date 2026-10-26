// How realApi.ts works out where an entity's website came from (CHUD-31).
import { test, expect } from "vitest";
import { toWebsiteInfo } from "./realApi";

const base = { organization_id: 1, domain_id: 1, name: "Sacramento Metro Fire" };

test("no website means no source or date", () => {
  expect(toWebsiteInfo({ ...base, website_url: null, updated_by_type: "REFRESH", date_last_updated: "2026-10-20T19:00:00Z" }))
    .toEqual({ websiteSource: "", websiteUpdatedAt: "" });
});

test("uses the website's own source and date when the API sends them (CHUD-30)", () => {
  expect(toWebsiteInfo({
    ...base,
    website_url: "https://metrofire.ca.gov/",
    updated_by_type: "USER", // a later name edit must not change the website's source
    date_last_updated: "2026-10-22T19:00:00Z",
    website_source: "auto",
    website_updated_at: "2026-10-20T19:00:00Z",
  })).toEqual({ websiteSource: "auto", websiteUpdatedAt: "2026-10-20T19:00:00Z" });
});

test("falls back to the row's audit columns until then", () => {
  const row = { ...base, website_url: "https://metrofire.ca.gov/", date_last_updated: "2026-10-20T19:00:00Z" };
  expect(toWebsiteInfo({ ...row, updated_by_type: "REFRESH" }).websiteSource).toBe("auto");
  expect(toWebsiteInfo({ ...row, updated_by_type: "USER" })).toEqual({ websiteSource: "manual", websiteUpdatedAt: "2026-10-20T19:00:00Z" });
});
