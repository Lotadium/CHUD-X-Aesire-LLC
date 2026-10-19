import { test, expect } from "vitest";
import * as api from "./api";
import { getOrganization, updateOrganization, setOrganizationFlag, listOrganizations, getContact, updateContact, setContactFlag } from "./api";

// ---------- Organizations ----------

test("gets an organization", async () => {
  const org = await getOrganization("1");
  expect(org.name).toBe("Sacramento Metro Fire");
});

test("updates an organization", async () => {
  await updateOrganization("1", { name: "Metro Fire" });
  const org = await getOrganization("1");
  expect(org.name).toBe("Metro Fire");
});

test("lists organizations for the dropdown", async () => {
  const list = await listOrganizations();
  expect(list.length).toBeGreaterThan(0);
});

test("flags an organization without removing it, and can unflag it", async () => {
  await setOrganizationFlag("2", true, "District merged");
  const flagged = await getOrganization("2"); // still there
  expect(flagged.flagged).toBe(true);
  expect(flagged.flagReason).toBe("District merged");
  await setOrganizationFlag("2", false);
  expect((await getOrganization("2")).flagged).toBe(false);
});

// ---------- Contacts ----------

test("gets a contact", async () => {
  const contact = await getContact("1");
  expect(contact.lastName).toBe("Lopez");
});

test("updates a contact", async () => {
  await updateContact("1", { title: "Clerk of the Board" });
  const contact = await getContact("1");
  expect(contact.title).toBe("Clerk of the Board");
});

test("flags a contact without removing it", async () => {
  await setContactFlag("2", true, "Retired");
  const contact = await getContact("2"); // still there
  expect(contact.flagged).toBe(true);
  expect(contact.flagReason).toBe("Retired");
});

// Charter 2.3(f)(iv): "Do not include an option to remove records."
test("the API offers no way to delete records", () => {
  const names = Object.keys(api).join(" ");
  expect(names).not.toMatch(/delete|remove/i);
});
test("flagging without a reason is refused, like the real API", async () => {
  await expect(setOrganizationFlag("1", true, "  ")).rejects.toThrow(/reason is required/);
});
