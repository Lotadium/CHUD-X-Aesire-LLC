// AI use: written with help from Claude (Anthropic), directed by Rachel Wong (CHUD-49).
import type { Queryable } from "./db.ts";

/** Months are counted in Aesire's local time, so a search late on the 31st counts for that month. */
export const USAGE_TIME_ZONE = "America/Los_Angeles";

export type SearchUsage = { month: string; used: number; limit: number | null };

/**
 * Record one web search. Call this every time a request is actually sent to the
 * search provider (CHUD-29), including searches that find nothing.
 */
export async function recordSearch(
  db: Queryable,
  search: { organizationId?: number | null; provider?: string | null; searchedBy?: string | null } = {},
): Promise<void> {
  await db.query(
    "INSERT INTO web_search_log (organization_id, provider, searched_by) VALUES ($1, $2, $3)",
    [search.organizationId ?? null, search.provider ?? null, search.searchedBy ?? null],
  );
}

/** The monthly search limit from WEB_SEARCH_MONTHLY_LIMIT, or null when it isn't set or isn't a whole number. */
export function monthlyLimit(value = process.env.WEB_SEARCH_MONTHLY_LIMIT): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** How many searches have been recorded in the current month. */
export async function getMonthlyUsage(db: Queryable): Promise<SearchUsage> {
  const { rows } = await db.query<{ month: string; used: number }>(
    `SELECT to_char(m, 'YYYY-MM') AS month,
            (SELECT count(*)::int FROM web_search_log
              WHERE searched_at >= m AT TIME ZONE $1
                AND searched_at <  (m + interval '1 month') AT TIME ZONE $1) AS used
       FROM (SELECT date_trunc('month', now() AT TIME ZONE $1) AS m) AS this_month`,
    [USAGE_TIME_ZONE],
  );
  return { month: rows[0].month, used: rows[0].used, limit: monthlyLimit() };
}
