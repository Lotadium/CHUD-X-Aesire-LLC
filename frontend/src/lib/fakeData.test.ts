// Written with help from Claude Code (Sonnet 5.5) (AI assistant). Reviewed and tested by Irene Riva. See frontend/README.md → "AI assistance".
// Checks the demo sample data (CHUD-58) so a typo doesn't break the demo.
import { expect, test } from "vitest";
import { sampleContacts, sampleDomains, sampleOrganizations } from "./fakeData";
import { contactSchema, organizationSchema } from "./validation";

test("every id is unique", () => {
  expect(new Set(sampleOrganizations.map((o) => o.id)).size).toBe(sampleOrganizations.length);
  expect(new Set(sampleContacts.map((c) => c.id)).size).toBe(sampleContacts.length);
});

test("every contact works for an organization that exists", () => {
  const orgIds = new Set(sampleOrganizations.map((o) => o.id));
  for (const c of sampleContacts) expect(orgIds.has(c.organizationId), `contact ${c.id} -> organization ${c.organizationId}`).toBe(true);
});

test("every organization has a domain that exists", () => {
  const domainIds = new Set(sampleDomains.map((d) => d.id));
  for (const o of sampleOrganizations) expect(domainIds.has(o.domainId), `organization ${o.id}`).toBe(true);
});

test("every sample passes the form rules, so a record can be opened and saved without errors", () => {
  for (const o of sampleOrganizations) {
    expect(organizationSchema.safeParse(o).success, `organization ${o.id}`).toBe(true);
  }
  for (const c of sampleContacts) {
    expect(contactSchema.safeParse(c).success, `contact ${c.id}`).toBe(true);
  }
});

test("keeps the original samples the forms and tests rely on", () => {
  expect(sampleOrganizations.slice(0, 2).map((o) => o.name)).toEqual(["Sacramento Metro Fire", "Folsom Water District"]);
  expect(sampleContacts[0]).toMatchObject({ id: "1", firstName: "Dana", lastName: "Lopez", organizationId: "1", email: "dlopez@metrofire.ca.gov" });
  expect(sampleContacts[1]).toMatchObject({ id: "2", firstName: "Marcus", lastName: "Reed", organizationId: "2", email: "" });
});

test("covers the cases the demo needs to show", () => {
  const orgs = sampleOrganizations;
  expect(orgs.some((o) => o.websiteUrl === "" && o.websiteStatus === "NOT_FOUND")).toBe(true); // no website found
  expect(orgs.some((o) => o.websiteStatus === "NEEDS_REVIEW" && o.websiteSuggestions > 0)).toBe(true); // suggestions to review
  expect(orgs.some((o) => o.flagged && o.flagReason !== "")).toBe(true); // flagged organization
  expect(orgs.some((o) => o.verifiedAt === "")).toBe(true); // not verified yet
  expect(orgs.some((o) => !sampleContacts.some((c) => c.organizationId === o.id))).toBe(true); // no contacts
  expect(sampleContacts.some((c) => c.email === "")).toBe(true);
  expect(sampleContacts.some((c) => c.phone === "")).toBe(true);
  expect(sampleContacts.some((c) => c.title === "")).toBe(true);
  expect(sampleContacts.some((c) => c.flagged)).toBe(true);
  expect(orgs.length).toBeGreaterThanOrEqual(10);
});

test("uses made-up addresses only (example.com, 555-01xx numbers)", () => {
  for (const c of sampleContacts) {
    if (c.email && c.id !== "1") expect(c.email, `contact ${c.id}`).toMatch(/@[a-z0-9.-]*example\.com$/);
    if (c.phone && c.id !== "1") expect(c.phone, `contact ${c.id}`).toMatch(/555-01\d\d$/);
  }
});
