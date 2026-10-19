// Checks realApi.ts against a running copy of Irene's backend.
// Skipped unless REAL_API_URL is set, e.g.:  REAL_API_URL=http://localhost:8787/api npm test
// Needs at least one organization and one contact in the database.
import { test, expect, vi } from "vitest";

const url: string | undefined = import.meta.env.REAL_API_URL;

test.skipIf(!url)("real API: load, save, and reload an organization", async () => {
  vi.stubEnv("VITE_API_URL", url!);
  const api = await import("./realApi");
  const [first] = await api.listOrganizations();
  const org = await api.getOrganization(first.id);
  const saved = await api.updateOrganization(org.id, { websiteUrl: "metrofire.ca.gov" });
  expect(saved.websiteUrl).toBe("https://metrofire.ca.gov"); // https:// added for the API
  expect((await api.listDomains()).length).toBeGreaterThan(0);
});

test.skipIf(!url)("real API: save a contact across person, position, and email", async () => {
  vi.stubEnv("VITE_API_URL", url!);
  const api = await import("./realApi");
  const contact = await api.getContact("1");
  const saved = await api.updateContact(contact.id, {
    firstName: contact.firstName,
    middleName: "",
    lastName: contact.lastName,
    organizationId: contact.organizationId,
    title: "Clerk of the Board",
    phone: "(916) 859-4300",
    phoneExt: "",
    mobilePhone: "",
    email: "DLopez@MetroFire.CA.gov",
  });
  expect(saved.title).toBe("Clerk of the Board");
  expect(saved.email).toBe("dlopez@metrofire.ca.gov");
  expect(saved.phoneExt).toBe("");
});

test.skipIf(!url)("real API: flag and unflag an entity and a contact, records are kept", async () => {
  vi.stubEnv("VITE_API_URL", url!);
  const api = await import("./realApi");
  const [first] = await api.listOrganizations();
  const flagged = await api.setOrganizationFlag(first.id, true, "District merged");
  expect(flagged.flagged).toBe(true);
  expect(flagged.flagReason).toBe("District merged");
  expect((await api.getOrganization(first.id)).flagged).toBe(true); // still there
  expect((await api.setOrganizationFlag(first.id, false)).flagged).toBe(false);

  const contact = await api.setContactFlag("1", true, "Retired");
  expect(contact.flagged).toBe(true);
  expect(contact.flagReason).toBe("Retired");
  expect((await api.setContactFlag("1", false)).flagReason).toBe("");
});

test.skipIf(!url)("real API: flagging without a reason is refused by the server", async () => {
  vi.stubEnv("VITE_API_URL", url!);
  const api = await import("./realApi");
  const [first] = await api.listOrganizations();
  await expect(api.setOrganizationFlag(first.id, true, "")).rejects.toThrow(/flag_reason/);
});

test.skipIf(!url)("real API: clearing an email flags it instead of deleting it, and typing it back restores it", async () => {
  vi.stubEnv("VITE_API_URL", url!);
  const api = await import("./realApi");
  const address = `test${Date.now()}@example.gov`;
  expect((await api.updateContact("2", { email: address })).email).toBe(address);
  expect((await api.updateContact("2", { email: "" })).email).toBe(""); // hidden from the form, kept in the database
  expect((await api.updateContact("2", { email: address })).email).toBe(address); // restored, no duplicate error
});
