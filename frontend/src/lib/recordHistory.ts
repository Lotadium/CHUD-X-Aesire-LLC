// Written with help from Claude Code (Opus 5.5) (AI assistant). Reviewed and tested by Rachel. See frontend/README.md → "AI assistance".
//
// Turns the record history from lib/api.ts (getOrganizationHistory) into text for the history panel (CHUD-57):
// who made a version and what it changed, in words a user can read.
import type { HistoryChange, RecordVersion } from "./api";

// Database column -> label on the screen. A column not listed here is shown as "Website status" style text.
const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  domain_id: "Domain",
  website_url: "Website",
  website_source: "Website source",
  website_status: "Website search",
  is_flagged: "Flagged as no longer valid",
  flag_reason: "Flag reason",
};

// Columns that are not useful to people reading the history, so the panel leaves them out
const HIDDEN_FIELDS = ["website_candidates", "website_updated_at"];

const STATUS_TEXT: Record<string, string> = {
  NOT_SEARCHED: "Not searched yet",
  FOUND: "Found",
  NEEDS_REVIEW: "Needs review",
  NOT_FOUND: "Not Found",
};

const SOURCE_TEXT: Record<string, string> = { auto: "Found automatically", manual: "Entered manually" };

// "website_status" -> "Website status"
function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, " ");
}

/** One value as text. A blank value reads "Not Found" (charter 2.3 e.v). */
export function valueText(field: string, value: unknown, domains: { id: string; name: string }[] = []): string {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return "Not Found";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = String(value);
  if (field === "domain_id") return domains.find((d) => d.id === text)?.name ?? text;
  if (field === "website_status") return STATUS_TEXT[text] ?? text;
  if (field === "website_source") return SOURCE_TEXT[text.toLowerCase()] ?? text;
  return text;
}

/** "Website: Not Found → https://metrofire.ca.gov/" for each change people care about. */
export function describeChanges(changes: HistoryChange[], domains: { id: string; name: string }[] = []): string[] {
  return changes
    .filter((c) => !HIDDEN_FIELDS.includes(c.field))
    .map((c) => `${fieldLabel(c.field)}: ${valueText(c.field, c.from, domains)} → ${valueText(c.field, c.to, domains)}`);
}

/** Who made a version: a username, or "Refresh" for the automatic data refresh. */
export function changedByText(version: RecordVersion): string {
  if (version.changedByType === "REFRESH") return version.changedBy ? `Refresh (started by ${version.changedBy})` : "Refresh";
  return version.changedBy || "Unknown user";
}

/** "Oct 20, 2026, 12:00 PM", or "Not Found" for a missing date. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (iso === "" || Number.isNaN(date.getTime())) return "Not Found";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
