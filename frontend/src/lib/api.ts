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
