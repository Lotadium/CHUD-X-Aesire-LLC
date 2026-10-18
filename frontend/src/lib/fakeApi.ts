// FAKE API: stores data in memory so I can build the forms before the real API is ready.
// When the real API is done, replace the inside of each function with a fetch() call.
import type { z } from "zod";
import { organizationSchema, contactSchema } from "./validation";

// Wait a little, like a real network request would
const delay = () => new Promise((resolve) => setTimeout(resolve, 300));

// ---------- Organizations ----------

// Charter 2.3(f)(iv): records are never removed. A record that is no longer valid
// is FLAGGED instead; it stays in the database with its history kept.
export type Flag = { flagged: boolean; flagReason: string };

// The shape of an organization: the form fields plus an id and its flag
export type Organization = z.infer<typeof organizationSchema> & { id: string } & Flag;

// Pretend database (resets every time the page reloads)
const organizations: Organization[] = [
  { id: "1", name: "Sacramento Metro Fire", domainId: "1", websiteUrl: "https://metrofire.ca.gov/", flagged: false, flagReason: "" },
  { id: "2", name: "Folsom Water District", domainId: "2", websiteUrl: "", flagged: false, flagReason: "" },
];

// Options for the "Domain" dropdown (Ryan's domain table)
const domains = [
  { id: "1", name: "Fire" },
  { id: "2", name: "Water" },
  { id: "3", name: "EMS" },
];

export async function listDomains(): Promise<{ id: string; name: string }[]> {
  await delay();
  return domains.map((d) => ({ ...d }));
}

export async function getOrganization(id: string): Promise<Organization> {
  await delay();
  const org = organizations.find((o) => o.id === id);
  if (!org) throw new Error("Organization not found.");
  return { ...org };
}

export async function updateOrganization(id: string, changes: Partial<Organization>): Promise<Organization> {
  await delay();
  const index = organizations.findIndex((o) => o.id === id);
  if (index === -1) throw new Error("Organization not found.");
  organizations[index] = { ...organizations[index], ...changes, id };
  return { ...organizations[index] };
}

// Flag (or unflag) a record as no longer valid. Nothing is removed.
export async function setOrganizationFlag(id: string, flagged: boolean, reason = ""): Promise<Organization> {
  return updateOrganization(id, { flagged, flagReason: flagged ? reason.trim() : "" });
}

// Options for the contact form's "Organization" dropdown: just id + name
export async function listOrganizations(): Promise<{ id: string; name: string }[]> {
  await delay();
  return organizations.map((o) => ({ id: o.id, name: o.name }));
}

// ---------- Contacts ----------

// The shape of a contact: the form fields plus an id and its flag
export type Contact = z.infer<typeof contactSchema> & { id: string } & Flag;

// Pretend database. organizationId "1" = Sacramento Metro Fire, "2" = Folsom Water District
const contacts: Contact[] = [
  { id: "1", firstName: "Dana", middleName: "", lastName: "Lopez", organizationId: "1", title: "Board Clerk",
    phone: "(916) 859-4300", phoneExt: "12", mobilePhone: "", email: "dlopez@metrofire.ca.gov",
    flagged: false, flagReason: "" },
  { id: "2", firstName: "Marcus", middleName: "J", lastName: "Reed", organizationId: "2", title: "General Manager",
    phone: "(916) 555-0142", phoneExt: "", mobilePhone: "(916) 555-0199", email: "",
    flagged: false, flagReason: "" },
];

export async function getContact(id: string): Promise<Contact> {
  await delay();
  const contact = contacts.find((c) => c.id === id);
  if (!contact) throw new Error("Contact not found.");
  return { ...contact };
}

export async function updateContact(id: string, changes: Partial<Contact>): Promise<Contact> {
  await delay();
  const index = contacts.findIndex((c) => c.id === id);
  if (index === -1) throw new Error("Contact not found.");
  contacts[index] = { ...contacts[index], ...changes, id };
  return { ...contacts[index] };
}

// Flag (or unflag) a contact as no longer valid. Nothing is removed.
export async function setContactFlag(id: string, flagged: boolean, reason = ""): Promise<Contact> {
  return updateContact(id, { flagged, flagReason: flagged ? reason.trim() : "" });
}
