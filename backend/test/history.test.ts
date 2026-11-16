// AI use: written with AI help from Claude Code (Opus 5.5), directed by Ryan Griffiths. See "AI use" in backend/README.md.
// Unit tests for working out what each saved version changed (CHUD-36). No database needed.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { diffVersions } from "../src/history.ts";

const v1 = {
  organization_id: 1,
  name: "Metro Fire",
  website_url: null,
  is_flagged: false,
  version: 1,
  date_created: "2026-11-01T10:00:00Z",
  date_last_updated: "2026-11-01T10:00:00Z",
  last_verified_at: "2026-11-01T10:00:00Z",
  updated_by: "ryan",
  updated_by_type: "USER",
};

describe("diffVersions", () => {
  it("lists each field that changed, with the old and new value", () => {
    const v2 = { ...v1, name: "Sacramento Metro Fire", website_url: "https://metrofire.ca.gov/", version: 2 };
    assert.deepEqual(diffVersions(v1, v2), [
      { field: "name", from: "Metro Fire", to: "Sacramento Metro Fire" },
      { field: "website_url", from: null, to: "https://metrofire.ca.gov/" },
    ]);
  });

  it("ignores the audit columns (version, dates, who made the change)", () => {
    const v2 = {
      ...v1,
      version: 2,
      date_last_updated: "2026-11-02T10:00:00Z",
      last_verified_at: "2026-11-02T10:00:00Z",
      updated_by: "refresh",
      updated_by_type: "REFRESH",
    };
    assert.deepEqual(diffVersions(v1, v2), []);
  });

  it("has no changes for the first version", () => {
    assert.deepEqual(diffVersions(null, v1), []);
  });

  it("notices a flag being set and a field being cleared", () => {
    const flagged = { ...v1, is_flagged: true, flag_reason: "Closed", name: "Metro Fire" };
    assert.deepEqual(diffVersions(v1, flagged), [
      { field: "is_flagged", from: false, to: true },
      { field: "flag_reason", from: null, to: "Closed" },
    ]);
    const cleared = { ...flagged, flag_reason: null };
    assert.deepEqual(diffVersions(flagged, cleared), [{ field: "flag_reason", from: "Closed", to: null }]);
  });

  it("treats a missing field and null as the same", () => {
    assert.deepEqual(diffVersions({ name: "A", fax: null }, { name: "A" }), []);
  });
});
