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

// CHUD-57: written with Cline using Gemini 3.5 Flash (AI assistant). Reviewed and tested by Rachel.
test("real API: reads an organization's history and maps it to the form's names (server faked with a stubbed fetch)", async () => {
  let requestedUrl = "";
  const data = [
    {
      version: 2,
      changed_at: "2026-11-22T10:00:00Z",
      changed_by_type: "USER",
      changed_by: null,
      changes: [{ field: "name", from: "Old", to: "New" }],
    },
    {
      version: 1,
      changed_at: "2026-11-20T10:00:00Z",
      changed_by_type: "REFRESH",
      changed_by: "irene",
      changes: [],
    },
  ];

  vi.stubGlobal("fetch", async (url: string | URL) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ data }), { status: 200 });
  });

  try {
    const api = await import("./realApi");
    const history = await api.getOrganizationHistory("5");
    expect(requestedUrl.endsWith("/organizations/5/history")).toBe(true);
    expect(history[0].changedBy).toBe("");
    expect(history[1].changedBy).toBe("irene");
    expect(history).toEqual([
      {
        version: 2,
        changedAt: "2026-11-22T10:00:00Z",
        changedByType: "USER",
        changedBy: "",
        changes: [{ field: "name", from: "Old", to: "New" }],
      },
      {
        version: 1,
        changedAt: "2026-11-20T10:00:00Z",
        changedByType: "REFRESH",
        changedBy: "irene",
        changes: [],
      },
    ]);
  } finally {
    vi.unstubAllGlobals();
  }
});
