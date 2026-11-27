// Written with help from Claude Code (Sonnet 5.5) (AI assistant). Reviewed and tested by Irene Riva. See frontend/README.md → "AI assistance".
//
// Sample data for the fake API (CHUD-58, demo rehearsal). Everything here is made up: the organizations,
// people, phone numbers (555-01xx) and email addresses (example.com) are not real. The fake API copies this
// data, so changes made while the app runs are lost when the page reloads.
//
// Organizations 1 and 2 and contacts 1 and 2 are the original samples that the forms and tests use: do not change them.
// The rest cover what the demo needs to show:
//   - no website found (3), website suggestions waiting for review (8, 9), website not searched yet (11)
//   - a flagged organization (10), a flagged contact (16)
//   - contacts with no email (6, 9, 18) or no phone/title (17, 18, 19)
//   - an organization with no contacts yet (11) and one with several (4)
// The names of 3, 9 and 14 match the fake refresh run in refreshApi.ts, so the "couldn't be verified" list
// shows organizations that exist here.
import type { Contact, Organization } from "./fakeApi";

export const sampleDomains = [
  { id: "1", name: "Fire" },
  { id: "2", name: "Water" },
  { id: "3", name: "EMS" },
];

const CREATED = "2026-10-05T16:30:00Z";

// A website found by website discovery
const found = (url: string, when: string) => ({
  websiteUrl: url,
  websiteSource: "auto" as const,
  websiteUpdatedAt: when,
  websiteStatus: "FOUND" as const,
  websiteSuggestions: 0,
});

// No website saved yet, in different states of the discovery
const noSite = (status: "NOT_SEARCHED" | "NOT_FOUND" | "NEEDS_REVIEW", suggestions = 0) => ({
  websiteUrl: "",
  websiteSource: "" as const,
  websiteUpdatedAt: "",
  websiteStatus: status,
  websiteSuggestions: suggestions,
});

const ok = { flagged: false, flagReason: "" };

export const sampleOrganizations: Organization[] = [
  { id: "1", name: "Sacramento Metro Fire", domainId: "1", websiteUrl: "https://metrofire.ca.gov/", flagged: false, flagReason: "",
    websiteSource: "auto", websiteUpdatedAt: "2026-10-20T19:00:00Z", websiteStatus: "FOUND", websiteSuggestions: 0,
    createdAt: "2026-10-05T16:30:00Z", updatedAt: "2026-10-20T19:00:00Z", verifiedAt: "2026-10-28T17:15:00Z" },
  { id: "2", name: "Folsom Water District", domainId: "2", websiteUrl: "", flagged: false, flagReason: "",
    websiteSource: "", websiteUpdatedAt: "", websiteStatus: "NOT_SEARCHED", websiteSuggestions: 0,
    createdAt: "2026-10-05T16:30:00Z", updatedAt: "2026-10-05T16:30:00Z", verifiedAt: "2026-10-05T16:30:00Z" },

  { id: "3", name: "Hartley Water District", domainId: "2", ...ok, ...noSite("NOT_FOUND"),
    createdAt: CREATED, updatedAt: "2026-11-03T18:00:00Z", verifiedAt: "2026-11-03T18:00:00Z" },
  { id: "4", name: "Rio Linda Fire", domainId: "1", ...ok, ...found("https://www.riolindafire.example.com/", "2026-10-21T17:00:00Z"),
    createdAt: CREATED, updatedAt: "2026-10-21T17:00:00Z", verifiedAt: "2026-11-02T20:30:00Z" },
  { id: "5", name: "Elk Grove EMS Authority", domainId: "3", ...ok,
    websiteUrl: "https://www.elkgroveems.example.com/", websiteSource: "manual", websiteUpdatedAt: "2026-10-27T21:10:00Z",
    websiteStatus: "FOUND", websiteSuggestions: 0,
    createdAt: CREATED, updatedAt: "2026-10-27T21:10:00Z", verifiedAt: "2026-10-27T21:10:00Z" },
  { id: "6", name: "Delta Resource Conservation", domainId: "2", ...ok, ...found("https://deltaconservation.example.com/", "2026-10-22T16:00:00Z"),
    createdAt: CREATED, updatedAt: "2026-10-22T16:00:00Z", verifiedAt: "" },
  { id: "7", name: "Galt Fire Protection District", domainId: "1", ...ok, ...found("https://www.galtfire.example.com/", "2026-10-23T15:45:00Z"),
    createdAt: CREATED, updatedAt: "2026-10-23T15:45:00Z", verifiedAt: "2026-11-02T20:31:00Z" },
  { id: "8", name: "Natomas Water Authority", domainId: "2", ...ok, ...noSite("NEEDS_REVIEW", 2),
    createdAt: CREATED, updatedAt: "2026-10-24T14:20:00Z", verifiedAt: "2026-10-24T14:20:00Z" },
  { id: "9", name: "Valley Mosquito Abatement", domainId: "2", ...ok, ...noSite("NEEDS_REVIEW", 3),
    createdAt: CREATED, updatedAt: "2026-10-24T14:25:00Z", verifiedAt: "2026-10-24T14:25:00Z" },
  { id: "10", name: "Citrus Heights Fire Rescue", domainId: "1", flagged: true, flagReason: "District merged into Sacramento Metro Fire",
    ...found("https://www.citrusheightsfire.example.com/", "2026-10-25T18:00:00Z"),
    createdAt: CREATED, updatedAt: "2026-11-04T19:00:00Z", verifiedAt: "2026-10-25T18:00:00Z" },
  { id: "11", name: "Cosumnes EMS Partners", domainId: "3", ...ok, ...noSite("NOT_SEARCHED"),
    createdAt: CREATED, updatedAt: CREATED, verifiedAt: CREATED },
  { id: "12", name: "Wilton Water Works", domainId: "2", ...ok, ...found("https://www.wiltonwater.example.com/", "2026-10-26T16:30:00Z"),
    createdAt: CREATED, updatedAt: "2026-10-26T16:30:00Z", verifiedAt: "2026-11-02T20:32:00Z" },
  { id: "13", name: "Antelope Valley Fire", domainId: "1", ...ok, ...found("https://www.antelopevalleyfire.example.com/", "2026-10-28T17:20:00Z"),
    createdAt: CREATED, updatedAt: "2026-10-28T17:20:00Z", verifiedAt: "2026-11-02T20:33:00Z" },
  { id: "14", name: "Station 12 (General Line)", domainId: "1", ...ok, ...found("https://www.station12.example.com/", "2026-10-29T15:10:00Z"),
    createdAt: CREATED, updatedAt: "2026-10-29T15:10:00Z", verifiedAt: "2026-10-29T15:10:00Z" },
];

// Shorthand for a contact without a middle name, mobile phone or extension
const person = (
  id: string, organizationId: string, firstName: string, lastName: string, title: string, phone: string, email: string,
  more: Partial<Contact> = {},
): Contact => ({
  id, organizationId, firstName, middleName: "", lastName, title, phone, phoneExt: "", mobilePhone: "", email,
  flagged: false, flagReason: "", ...more,
});

export const sampleContacts: Contact[] = [
  { id: "1", firstName: "Dana", middleName: "", lastName: "Lopez", organizationId: "1", title: "Board Clerk",
    phone: "(916) 859-4300", phoneExt: "12", mobilePhone: "", email: "dlopez@metrofire.ca.gov",
    flagged: false, flagReason: "" },
  { id: "2", firstName: "Marcus", middleName: "J", lastName: "Reed", organizationId: "2", title: "General Manager",
    phone: "(916) 555-0142", phoneExt: "", mobilePhone: "(916) 555-0199", email: "",
    flagged: false, flagReason: "" },

  person("3", "3", "Priya", "Natarajan", "General Manager", "(916) 555-0118", "priya.natarajan@hartleywater.example.com"),
  person("4", "4", "Tomas", "Ibarra", "Fire Chief", "(916) 555-0121", "tibarra@riolindafire.example.com", { phoneExt: "100" }),
  person("5", "4", "Keisha", "Brown", "Battalion Chief", "(916) 555-0122", "kbrown@riolindafire.example.com", { mobilePhone: "(916) 555-0123" }),
  person("6", "4", "Jun", "Watanabe", "Administrative Analyst", "(916) 555-0124", ""),
  person("7", "5", "Elena", "Vasquez", "Medical Director", "(916) 555-0130", "evasquez@elkgroveems.example.com"),
  person("8", "5", "Omar", "Haddad", "Operations Manager", "(916) 555-0131", "ohaddad@elkgroveems.example.com", { phoneExt: "24" }),
  person("9", "6", "Lindsey", "Park", "Program Coordinator", "(916) 555-0140", ""),
  person("10", "7", "Ray", "Delgado", "Fire Chief", "(209) 555-0150", "rdelgado@galtfire.example.com"),
  person("11", "7", "Anna", "Kowalski", "Office Manager", "(209) 555-0151", "akowalski@galtfire.example.com"),
  person("12", "8", "Sam", "Okafor", "District Engineer", "(916) 555-0160", "sokafor@natomaswater.example.com"),
  person("13", "9", "Hannah", "Lee", "District Manager", "(916) 555-0170", "hlee@valleymosquito.example.com"),
  person("14", "10", "Gordon", "Pike", "Fire Chief", "(916) 555-0180", "gpike@citrusheightsfire.example.com"),
  person("15", "12", "Beth", "Marlowe", "General Manager", "(916) 555-0190", "bmarlowe@wiltonwater.example.com"),
  person("16", "12", "Carl", "Jensen", "Operations Supervisor", "(916) 555-0191", "cjensen@wiltonwater.example.com",
    { flagged: true, flagReason: "Retired in October" }),
  person("17", "13", "Mia", "Tran", "Fire Marshal", "", "mtran@antelopevalleyfire.example.com"),
  person("18", "14", "Alex", "Moreno", "Captain", "", ""),
  person("19", "14", "Chris", "Dunn", "", "(916) 555-0141", "cdunn@station12.example.com"),
];
