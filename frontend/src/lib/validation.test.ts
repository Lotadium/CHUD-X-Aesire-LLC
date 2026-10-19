import { test, expect } from "vitest";
import { organizationSchema, contactSchema } from "./validation";

// ---------- Organization ----------

test("accepts a valid organization", () => {
  const result = organizationSchema.safeParse({ name: "Sacramento Metro Fire", domainId: "1", websiteUrl: "https://metrofire.ca.gov/" });
  expect(result.success).toBe(true);
});

test("rejects an empty organization name", () => {
  const result = organizationSchema.safeParse({ name: "   ", domainId: "1", websiteUrl: "https://metrofire.ca.gov/" });
  expect(result.success).toBe(false);
});

test("rejects a missing domain", () => {
  const result = organizationSchema.safeParse({ name: "Sacramento Metro Fire", domainId: "", websiteUrl: "https://metrofire.ca.gov/" });
  expect(result.success).toBe(false);
});

test("accepts a blank website", () => {
  const result = organizationSchema.safeParse({ name: "Sacramento Metro Fire", domainId: "1", websiteUrl: "" });
  expect(result.success).toBe(true);
});

test("rejects a javascript: link as the website", () => {
  const result = organizationSchema.safeParse({ name: "Sacramento Metro Fire", domainId: "1", websiteUrl: "javascript:alert(1)" });
  expect(result.success).toBe(false);
});

// ---------- Contact ----------

const validContact = { firstName: "Dana", middleName: "", lastName: "Lopez", organizationId: "1", title: "Board Clerk", phone: "916-859-4300", phoneExt: "12", mobilePhone: "", email: "dlopez@metrofire.ca.gov" };

test("accepts a valid contact", () => {
  expect(contactSchema.safeParse(validContact).success).toBe(true);
});

test("rejects an empty first name", () => {
  expect(contactSchema.safeParse({ ...validContact, firstName: "  " }).success).toBe(false);
});

test("rejects a missing organization", () => {
  expect(contactSchema.safeParse({ ...validContact, organizationId: "" }).success).toBe(false);
});

test("accepts blank optional fields", () => {
  expect(contactSchema.safeParse({ ...validContact, middleName: "", title: "", phone: "", phoneExt: "", mobilePhone: "", email: "" }).success).toBe(true);
});

test("rejects letters in the extension", () => {
  expect(contactSchema.safeParse({ ...validContact, phoneExt: "x12" }).success).toBe(false);
});

test("saves email in lowercase", () => {
  const result = contactSchema.safeParse({ ...validContact, email: "DLopez@MetroFire.CA.gov" });
  expect(result.success && result.data.email).toBe("dlopez@metrofire.ca.gov");
});