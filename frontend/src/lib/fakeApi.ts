// FAKE API: stores data in memory so I can build the forms before the real API is ready.
// When the real API is done, replace the inside of each function with a fetch() call.
import type { z } from "zod";
import { organizationSchema, contactSchema } from "./validation";
import { sameWebsite } from "./website";

// Wait a little, like a real network request would
const delay = () => new Promise((resolve) => setTimeout(resolve, 300));

// ---------- Organizations ----------

// Charter 2.3(f)(iv): records are never removed. A record that is no longer valid
// is FLAGGED instead; it stays in the database with its history kept.
export type Flag = { flagged: boolean; flagReason: string };

// Where the saved website came from (CHUD-31):
//   "auto"   = found by website discovery (CHUD-29/30)
//   "manual" = typed in by staff on the entity form
//   ""       = no website saved
export type WebsiteSource = "auto" | "manual" | "";
// Where website discovery stands for this entity (Irene's CHUD-30 API, `website_status`)
export type WebsiteStatusValue = "NOT_SEARCHED" | "FOUND" | "NEEDS_REVIEW" | "NOT_FOUND" | "";
export type WebsiteInfo = {
  websiteSource: WebsiteSource;
  websiteUpdatedAt: string; // date as ISO text, or ""
  websiteStatus: WebsiteStatusValue;
  websiteSuggestions: number; // suggested websites waiting for review (0 to 3)
};

// Like the real API: a website that is already set is only replaced or cleared when confirmed
export type UpdateOptions = { confirmOverwrite?: boolean };

// The shape of an organization: the form fields plus an id, its flag, and where its website came from
export type Organization = z.infer<typeof organizationSchema> & { id: string } & Flag & WebsiteInfo;

// Pretend database (resets every time the page reloads)
const organizations: Organization[] = [
  { id: "1", name: "Sacramento Metro Fire", domainId: "1", websiteUrl: "https://metrofire.ca.gov/", flagged: false, flagReason: "",
    websiteSource: "auto", websiteUpdatedAt: "2026-10-20T19:00:00Z", websiteStatus: "FOUND", websiteSuggestions: 0 },
  { id: "2", name: "Folsom Water District", domainId: "2", websiteUrl: "", flagged: false, flagReason: "",
    websiteSource: "", websiteUpdatedAt: "", websiteStatus: "NOT_SEARCHED", websiteSuggestions: 0 },
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

export async function updateOrganization(id: string, changes: Partial<Organization>, options: UpdateOptions = {}): Promise<Organization> {
  await delay();
  const index = organizations.findIndex((o) => o.id === id);
  if (index === -1) throw new Error("Organization not found.");
  const before = organizations[index];
  const next = { ...before, ...changes, id };
  // Website rules copied from Irene's API (backend/src/website.ts):
  if (changes.websiteUrl !== undefined) {
    if (sameWebsite(changes.websiteUrl, before.websiteUrl)) {
      next.websiteUrl = before.websiteUrl; // no change; keeping it settles a pending review
      if (before.websiteUrl && before.websiteStatus === "NEEDS_REVIEW") {
        next.websiteStatus = "FOUND";
        next.websiteSuggestions = 0;
      }
    } else {
      // An existing website is only replaced or cleared when the user confirmed it
      if (before.websiteUrl !== "" && !options.confirmOverwrite) {
        throw new Error(`This entity already has a website (${before.websiteUrl}). Confirm to replace it.`);
      }
      // A website typed in on the form is "manual"; clearing it removes the source and date
      const cleared = changes.websiteUrl === "";
      next.websiteSource = cleared ? "" : "manual";
      next.websiteUpdatedAt = cleared ? "" : new Date().toISOString();
      next.websiteStatus = cleared ? "NOT_SEARCHED" : "FOUND";
      next.websiteSuggestions = 0;
    }
  }
  organizations[index] = next;
  return { ...organizations[index] };
}

// Flag (or unflag) a record as no longer valid. Nothing is removed.
export async function setOrganizationFlag(id: string, flagged: boolean, reason = ""): Promise<Organization> {
  if (flagged && reason.trim() === "") throw new Error("A reason is required to flag a record.");
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
  if (flagged && reason.trim() === "") throw new Error("A reason is required to flag a record.");
  return updateContact(id, { flagged, flagReason: flagged ? reason.trim() : "" });
}
