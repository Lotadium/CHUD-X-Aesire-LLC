// Data for the activity log page (CHUD-38). Talks to GET /api/activity (backend/src/routes/activity.ts).
// AI use: written with help from Claude (Anthropic).
const BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8787/api";

export const ACTIONS = {
  CREATED: "Created",
  MANUAL_UPDATE: "Manual update",
  FLAGGED: "Flagged no longer valid",
  REFRESH_ATTEMPT: "Refresh attempt",
  REFRESH_SUCCESS: "Refresh success",
} as const;
export type Action = keyof typeof ACTIONS;

export type ActivityEntry = {
  activity_id: number | string; // BIGINT in the database, so the API sends it as text
  occurred_at: string;
  action: Action;
  record_type: "organization" | "person" | "position" | "email";
  record_id: number;
  organization_id: number | null;
  person_id: number | null;
  organization_name: string | null;
  person_name: string | null;
  actor_type: "USER" | "REFRESH";
  actor_name: string | null;
  detail: string | null;
};

export type ActivityPage = { data: ActivityEntry[]; total: number };
export type ActivityFilters = { action: Action | ""; organizationId: string };

export const PAGE_SIZE = 50;

export async function fetchActivity(filters: ActivityFilters, offset = 0): Promise<ActivityPage> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (filters.action) params.set("action", filters.action);
  if (filters.organizationId) params.set("organization_id", filters.organizationId);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/activity?${params}`);
  } catch {
    throw new Error("Can't reach the server. Check that the API is running.");
  }
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  return res.json() as Promise<ActivityPage>;
}

/** Where an entry's record opens: the entity form for an entity, the contact form for anything about a contact. */
export function recordLink(entry: ActivityEntry): { href: string; label: string } | null {
  if (entry.record_type === "organization") {
    return { href: `#/entity/${entry.record_id}`, label: entry.organization_name ?? `Entity #${entry.record_id}` };
  }
  if (entry.person_id === null) return null;
  const name = entry.person_name ?? `Contact #${entry.person_id}`;
  const part = entry.record_type === "email" ? " (email)" : entry.record_type === "position" ? " (position)" : "";
  return { href: `#/contact/${entry.person_id}`, label: name + part };
}
