// Written with help from Claude Code (Opus 5.5) (AI assistant). Reviewed and tested by Rachel. See frontend/README.md → "AI assistance".
// Tests for the record history text (CHUD-57) and the fake API's history (it must behave like the real one).
import { expect, test } from "vitest";
import { getOrganizationHistory, updateOrganization } from "./api";
import { changedByText, describeChanges } from "./recordHistory";

test("describes changes in words, with Not Found for blanks and domain names instead of ids", () => {
  const domains = [{ id: "1", name: "Fire" }, { id: "2", name: "Water" }];
  expect(
    describeChanges(
      [
        { field: "domain_id", from: 1, to: 2 },
        { field: "is_flagged", from: false, to: true },
        { field: "flag_reason", from: null, to: "District merged" },
        { field: "website_candidates", from: null, to: [{ url: "https://a.example" }] }, // left out
      ],
      domains,
    ),
  ).toEqual(["Domain: Fire → Water", "Flagged as no longer valid: No → Yes", "Flag reason: Not Found → District merged"]);
});

test("names who made a version", () => {
  const base = { version: 2, changedAt: "", changes: [] };
  expect(changedByText({ ...base, changedByType: "USER", changedBy: "irene" })).toBe("irene");
  expect(changedByText({ ...base, changedByType: "USER", changedBy: "" })).toBe("Unknown user");
  expect(changedByText({ ...base, changedByType: "REFRESH", changedBy: "" })).toBe("Refresh");
});

test("fake API: a save that changes something adds a version, newest first; a save with no change does not", async () => {
  const before = await getOrganizationHistory("2");
  expect(before).toHaveLength(1);

  await updateOrganization("2", { name: "Folsom Water" });
  const after = await getOrganizationHistory("2");
  expect(after).toHaveLength(2);
  expect(after[0]).toMatchObject({ version: 2, changedByType: "USER", changes: [{ field: "name", from: "Folsom Water District", to: "Folsom Water" }] });

  await updateOrganization("2", { name: "Folsom Water" }); // same value again
  expect(await getOrganizationHistory("2")).toHaveLength(2);
});
