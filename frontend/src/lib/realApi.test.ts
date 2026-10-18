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
