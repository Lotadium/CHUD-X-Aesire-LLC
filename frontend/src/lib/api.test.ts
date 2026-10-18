import { test, expect } from "vitest";
import { getOrganization, updateOrganization, deleteOrganization, listOrganizations, getContact, updateContact, deleteContact } from "./api";

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

test("deletes an organization", async () => {
  await deleteOrganization("2");
  await expect(getOrganization("2")).rejects.toThrow("not found");
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

test("deletes a contact", async () => {
  await deleteContact("2");
  await expect(getContact("2")).rejects.toThrow("not found");
});