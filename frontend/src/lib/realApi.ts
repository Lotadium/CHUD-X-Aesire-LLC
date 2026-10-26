// REAL API: talks to Irene's backend (CHUD-13, see backend/README.md).
// It exposes the exact same functions as fakeApi.ts, so the forms don't change.
// The differences between the form and the API are handled here:
//   - field names:  form uses camelCase (domainId), API uses snake_case (domain_id)
//   - ids:          form uses text ("1"), API uses numbers (1)
//   - websites:     API needs https://, so it is added when missing
//   - blanks:       form uses "", API uses null
//   - contacts:     one contact = a person + a position + an email (up to 3 requests)
//   - no deleting:  per the charter (2.3 f.iv) records are flagged, never removed.
//                   Flags use `is_flagged` + `flag_reason` columns on organization and
//                   person, which the database (CHUD-10) and API (CHUD-13) still need to add.
import type { Contact, Flag, Organization, UpdateOptions, WebsiteInfo, WebsiteStatusValue } from "./fakeApi";

// Where the API lives. Set VITE_API_URL in .env.local; defaults to Irene's local server.
const BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8787/api";
// Who is making changes (saved in the record history). Real sign-in comes in a later sprint.
const USER: string = import.meta.env.VITE_API_USER ?? "frontend";

// ---------- helpers ----------

// Send one request and turn API errors into readable messages for the form
async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE_URL + path, {
      method,
      headers: { "Content-Type": "application/json", "X-User": USER },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach the server. Check that the API is running and try again.");
  }
  if (res.status === 204) return undefined as T; // success with no content
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // API errors look like { error: "...", fields: { name: "is required" } }
    const fields = data?.fields ? Object.entries(data.fields).map(([f, m]) => `${f} ${m}`).join(", ") : "";
    throw new Error(fields ? `${data.error}: ${fields}` : (data?.error ?? `Request failed (${res.status}).`));
  }
  return data as T;
}

const toNumber = (id: string) => Number(id);
const blankToNull = (v: string | undefined) => (v === undefined || v.trim() === "" ? null : v.trim());
const nullToBlank = (v: string | null | undefined) => v ?? "";

// Flag columns as the API will send them (missing until the backend adds them)
type ApiFlag = { is_flagged?: boolean | null; flag_reason?: string | null };
const toFlag = (r: ApiFlag): Flag => ({ flagged: r.is_flagged === true, flagReason: nullToBlank(r.flag_reason) });

// Send a flag change. If the backend doesn't have the flag columns yet, it answers
// "No updatable fields were provided", so explain that instead of showing a confusing error.
async function sendFlag<T>(path: string, flagged: boolean, reason: string): Promise<T> {
  try {
    return await request<T>(path, "PATCH", { is_flagged: flagged, flag_reason: flagged ? blankToNull(reason) : null });
  } catch (err) {
    if (err instanceof Error && /No updatable fields/i.test(err.message)) {
      throw new Error("Flagging isn't supported by the server yet. The database and API need the is_flagged column (CHUD-10/CHUD-13).");
    }
    throw err;
  }
}

// "metrofire.ca.gov" -> "https://metrofire.ca.gov"
function withHttps(url: string): string | null {
  const v = url.trim();
  if (v === "") return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

// ---------- shapes the API sends back (only the fields we use) ----------

type ApiOrganization = {
  organization_id: number;
  domain_id: number;
  name: string;
  website_url: string | null;
  // Website discovery fields from Irene's CHUD-30 API (DataBase/database_add_website_discovery.sql)
  website_status?: "NOT_SEARCHED" | "FOUND" | "NEEDS_REVIEW" | "NOT_FOUND" | null;
  website_source?: "AUTO" | "MANUAL" | null;
  website_updated_at?: string | null;
  website_candidates?: { url: string; page_title: string | null }[] | null;
} & ApiFlag;
type ApiPosition = {
  position_id: number;
  organization_id: number;
  title: string | null;
  phone: string | null;
  phone_ext: string | null;
  mobile_phone: string | null;
};
type ApiEmail = { email_id: number; address: string; is_flagged?: boolean | null };
type ApiPerson = ApiFlag & {
  person_id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  positions: ApiPosition[];
  emails: ApiEmail[];
};

// ---------- domains ----------

export async function listDomains(): Promise<{ id: string; name: string }[]> {
  const res = await request<{ data: { domain_id: number; name: string }[] }>("/domains");
  return res.data.map((d) => ({ id: String(d.domain_id), name: d.name }));
}

// ---------- organizations ----------

// Where the saved website came from, when it changed, and where discovery stands (CHUD-31).
// Irene's API (CHUD-30) sends website_source as "AUTO" / "MANUAL"; the form uses "auto" / "manual".
export function toWebsiteInfo(o: ApiOrganization): WebsiteInfo {
  const hasUrl = !!o.website_url;
  const source = hasUrl && o.website_source ? (o.website_source.toLowerCase() as "auto" | "manual") : "";
  return {
    websiteSource: source === "auto" || source === "manual" ? source : "",
    websiteUpdatedAt: hasUrl ? (o.website_updated_at ?? "") : "",
    websiteStatus: (o.website_status ?? "") as WebsiteStatusValue,
    websiteSuggestions: o.website_candidates?.length ?? 0,
  };
}

function toOrganization(o: ApiOrganization): Organization {
  return {
    id: String(o.organization_id),
    name: o.name,
    domainId: String(o.domain_id),
    websiteUrl: nullToBlank(o.website_url),
    ...toFlag(o),
    ...toWebsiteInfo(o),
  };
}

export async function getOrganization(id: string): Promise<Organization> {
  return toOrganization(await request<ApiOrganization>(`/organizations/${id}`));
}

export async function updateOrganization(id: string, changes: Partial<Organization>, options: UpdateOptions = {}): Promise<Organization> {
  const body: Record<string, unknown> = {};
  if (changes.name !== undefined) body.name = changes.name;
  if (changes.domainId !== undefined) body.domain_id = toNumber(changes.domainId);
  if (changes.websiteUrl !== undefined) body.website_url = withHttps(changes.websiteUrl);
  // The API won't replace or clear a website that is already set without this (409 otherwise)
  if (options.confirmOverwrite) body.confirm_overwrite = true;
  return toOrganization(await request<ApiOrganization>(`/organizations/${id}`, "PATCH", body));
}

// Flag (or unflag) an entity as no longer valid. Nothing is removed.
export async function setOrganizationFlag(id: string, flagged: boolean, reason = ""): Promise<Organization> {
  return toOrganization(await sendFlag<ApiOrganization>(`/organizations/${id}`, flagged, reason));
}

export async function listOrganizations(): Promise<{ id: string; name: string }[]> {
  const res = await request<{ data: ApiOrganization[] }>("/organizations?limit=200");
  return res.data.map((o) => ({ id: String(o.organization_id), name: o.name }));
}

// ---------- contacts (person + first position + first email) ----------

// Remember which position/email row each contact's form is editing
// (and any flagged emails, in case the user types one of them back in)
const linkedRows = new Map<string, { positionId?: number; emailId?: number; flaggedEmails?: ApiEmail[] }>();

function toContact(p: ApiPerson): Contact {
  const pos = p.positions[0];
  // Emails are never deleted (charter 2.3 f.iv): a removed email is flagged, so show the first unflagged one
  const email = p.emails.find((e) => !e.is_flagged);
  const flaggedEmails = p.emails.filter((e) => e.is_flagged);
  linkedRows.set(String(p.person_id), { positionId: pos?.position_id, emailId: email?.email_id, flaggedEmails });
  return {
    id: String(p.person_id),
    firstName: p.first_name,
    middleName: nullToBlank(p.middle_name),
    lastName: p.last_name,
    organizationId: pos ? String(pos.organization_id) : "",
    title: nullToBlank(pos?.title),
    phone: nullToBlank(pos?.phone),
    phoneExt: nullToBlank(pos?.phone_ext),
    mobilePhone: nullToBlank(pos?.mobile_phone),
    email: email?.address ?? "",
    ...toFlag(p),
  };
}

export async function getContact(id: string): Promise<Contact> {
  return toContact(await request<ApiPerson>(`/people/${id}`));
}

export async function updateContact(id: string, changes: Partial<Contact>): Promise<Contact> {
  if (!linkedRows.has(id)) await getContact(id); // make sure we know the position/email ids
  const links = linkedRows.get(id) ?? {};

  // 1) Person: name fields
  const person: Record<string, unknown> = {};
  if (changes.firstName !== undefined) person.first_name = changes.firstName;
  if (changes.middleName !== undefined) person.middle_name = blankToNull(changes.middleName);
  if (changes.lastName !== undefined) person.last_name = changes.lastName;
  if (Object.keys(person).length > 0) await request(`/people/${id}`, "PATCH", person);

  // 2) Position: where they work, title, phones
  const position: Record<string, unknown> = {};
  if (changes.organizationId !== undefined) position.organization_id = toNumber(changes.organizationId);
  if (changes.title !== undefined) position.title = blankToNull(changes.title);
  if (changes.phone !== undefined) position.phone = blankToNull(changes.phone);
  if (changes.phoneExt !== undefined) position.phone_ext = blankToNull(changes.phoneExt);
  if (changes.mobilePhone !== undefined) position.mobile_phone = blankToNull(changes.mobilePhone);
  if (Object.keys(position).length > 0) {
    if (links.positionId) await request(`/positions/${links.positionId}`, "PATCH", position);
    else await request(`/people/${id}/positions`, "POST", position);
  }

  // 3) Email: update, add, or "remove". Nothing is deleted: a cleared email is flagged
  //    as no longer valid (kept with its history), per charter 2.3 f.iv.
  if (changes.email !== undefined) {
    const address = changes.email.trim().toLowerCase();
    const reused = links.flaggedEmails?.find((e) => e.address === address);
    if (links.emailId && address) {
      await request(`/emails/${links.emailId}`, "PATCH", { address });
    } else if (links.emailId && !address) {
      await request(`/emails/${links.emailId}`, "PATCH", { is_flagged: true, flag_reason: "Removed on the contact form" });
    } else if (reused) {
      await request(`/emails/${reused.email_id}`, "PATCH", { is_flagged: false }); // typed an old email back in
    } else if (address) {
      await request(`/people/${id}/emails`, "POST", { address });
    }
  }

  return getContact(id); // reload so the form shows exactly what was saved
}

// Flag (or unflag) a contact as no longer valid. The flag lives on the person record.
export async function setContactFlag(id: string, flagged: boolean, reason = ""): Promise<Contact> {
  await sendFlag(`/people/${id}`, flagged, reason);
  return getContact(id);
}
