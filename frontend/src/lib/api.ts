// The forms import everything from this file.
// There is deliberately no delete function: per the project charter (2.3 f.iv),
// records are flagged as no longer valid instead of removed.
// It picks the fake API (in-memory sample data) or the real API (Irene's backend).
//
//   Fake (default):  nothing to set up
//   Real:            create .env.local with   VITE_USE_REAL_API=true
//                    then restart `npm run dev`
import * as fakeApi from "./fakeApi";
import * as realApi from "./realApi";

export type { Organization, Contact, Flag, RecordDates, WebsiteSource, WebsiteStatusValue, UpdateOptions } from "./fakeApi";

const useReal = import.meta.env.VITE_USE_REAL_API === "true";
const api = useReal ? realApi : fakeApi;

export const listDomains = api.listDomains;
export const getOrganization = api.getOrganization;
export const updateOrganization = api.updateOrganization;
export const setOrganizationFlag = api.setOrganizationFlag;
export const listOrganizations = api.listOrganizations;
export const getContact = api.getContact;
export const updateContact = api.updateContact;
export const setContactFlag = api.setContactFlag;
export const listContactsForOrganization = api.listContactsForOrganization;

export type ContactSearchFilters = {
  query?: string;
  title?: string;
  fieldOfWork?: string;
  organization?: string;
};

export type ContactSearchResult = Contact & {
  organizationName: string;
  fieldOfWork: string;
};

const normalized = (value: string | undefined) => (value ?? "").trim().toLocaleLowerCase();

function matchesExact(value: string, filter: string | undefined): boolean {
  const expected = normalized(filter);
  return expected === "" || normalized(value) === expected;
}

export async function searchContacts(filters: ContactSearchFilters = {}): Promise<ContactSearchResult[]> {
  const [organizations, domains] = await Promise.all([api.listOrganizations(), api.listDomains()]);
  const domainNames = new Map(domains.map((domain) => [domain.id, domain.name]));

  const grouped = await Promise.all(
    organizations.map(async (organization) => {
      const fieldOfWork = domainNames.get(organization.domainId) ?? "";
      const contacts = await api.listContactsForOrganization(organization.id);
      return contacts.map((contact) => ({
        ...contact,
        organizationName: organization.name,
        fieldOfWork,
      }));
    }),
  );

  const queryTerms = normalized(filters.query).split(/\s+/u).filter(Boolean);

  return grouped.flat().filter((contact) => {
    const searchableText = normalized([
      contact.firstName,
      contact.middleName,
      contact.lastName,
      contact.title,
      contact.organizationName,
      contact.fieldOfWork,
    ].join(" "));

    return queryTerms.every((term) => searchableText.includes(term))
      && matchesExact(contact.title, filters.title)
      && matchesExact(contact.fieldOfWork, filters.fieldOfWork)
      && matchesExact(contact.organizationName, filters.organization);
  });
}
