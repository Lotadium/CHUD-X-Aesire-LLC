// AI use: written with AI help from Claude Code (Sonnet 5.5), directed by Irene Riva. See "AI use" in backend/README.md.
import type { Pool } from "pg";
import { one, updateRow, withTransaction, type Actor, type Queryable } from "../db.ts";
import { HttpError } from "../errors.ts";
import type { RankResult } from "../ranking/rank.ts";
import { getMonthlyUsage, recordSearch } from "../searchUsage.ts";
import { saveDiscoveryResult, type Discovery } from "../website.ts";
import { applyPlan, planContact, usableEmail, usablePhone, type StoredContact } from "./contacts.ts";
import type { ContactDetails, LookupResult, ReasonCode, RefreshDeps } from "./types.ts";

/**
 * Refresh (CHUD-35). A run is a list of records that is worked through a few at a time:
 *   POST /api/refresh            starts a run (a list of records, no work yet)
 *   POST /api/refresh/:id/process  does the next few records; the front end calls this until the run is complete
 *   GET  /api/refresh/:id        progress and the summary
 * Each record is handled on its own, so one failure never stops the run.
 */

export type Selection = { organizationIds?: number[]; domainId?: number; all?: boolean };

export type UnverifiedRecord = {
  organization_id: number;
  name: string;
  reason_code: string | null;
  reason: string | null;
  changed: boolean; // some details were still saved even though the record could not be fully verified
};

export type RunSummary = {
  run_id: number;
  requested_by: string | null;
  created_at: string;
  finished_at: string | null;
  status: "RUNNING" | "COMPLETE";
  total: number;
  processed: number; // finished records (verified + unverified): the progress bar's numerator
  percent_complete: number; // 0 to 100, for "10 of 50 records processed (20%)"
  verified: number;
  unverified: number;
  updated: number; // records where the refresh saved a change (a new website, or new contact details)
  unverified_records: UnverifiedRecord[];
};

/** A run without its list of unverified records, for the list of runs. */
export type RunListItem = Omit<RunSummary, "unverified_records">;

type RunCounts = { total: number; verified: number; unverified: number; updated: number };

function progress(counts: RunCounts) {
  const processed = counts.verified + counts.unverified;
  return {
    status: (processed === counts.total ? "COMPLETE" : "RUNNING") as RunSummary["status"],
    total: counts.total,
    processed,
    percent_complete: counts.total === 0 ? 0 : Math.round((processed * 100) / counts.total),
    verified: counts.verified,
    unverified: counts.unverified,
    updated: counts.updated,
  };
}

/** A claimed record that has not been finished for this long is picked up again (its request must have died). */
const STALE_CLAIM = "5 minutes";

// ---------- starting a run ----------

/** Make a run for the chosen records. Flagged records ("no longer valid") are never refreshed. */
export async function createRun(pool: Pool, actor: Actor, selection: Selection): Promise<RunSummary> {
  const runId = await withTransaction(pool, actor, async (db) => {
    if (selection.organizationIds) {
      const { rows } = await db.query<{ organization_id: number }>(
        "SELECT organization_id FROM organization WHERE organization_id = ANY($1::int[]) AND NOT is_flagged",
        [selection.organizationIds],
      );
      const usable = new Set(rows.map((r) => r.organization_id));
      const missing = selection.organizationIds.filter((id) => !usable.has(id));
      if (missing.length > 0) {
        throw new HttpError(400, "Some records do not exist or are flagged as no longer valid", {
          organization_ids: `not usable: ${missing.join(", ")}`,
        });
      }
    }

    const { rows: run } = await db.query<{ run_id: number }>(
      "INSERT INTO refresh_run (requested_by) VALUES ($1) RETURNING run_id",
      [actor.name],
    );
    const id = run[0].run_id;
    const { rowCount } = await db.query(
      `INSERT INTO refresh_item (run_id, organization_id, seq)
       SELECT $1, o.organization_id, row_number() OVER (ORDER BY lower(o.name), o.organization_id)
       FROM organization o
       WHERE NOT o.is_flagged
         AND ($2::int[] IS NULL OR o.organization_id = ANY($2::int[]))
         AND ($3::int IS NULL OR o.domain_id = $3)`,
      [id, selection.organizationIds ?? null, selection.domainId ?? null],
    );
    if (rowCount === 0) throw new HttpError(400, "No records match, so there is nothing to refresh");
    return id;
  });
  return getRunSummary(pool, runId) as Promise<RunSummary>;
}

// ---------- progress ----------

export async function getRunSummary(db: Queryable, runId: number): Promise<RunSummary | undefined> {
  const run = await one<Pick<RunSummary, "run_id" | "requested_by" | "created_at" | "finished_at">>(
    db,
    "SELECT run_id, requested_by, created_at, finished_at FROM refresh_run WHERE run_id = $1",
    [runId],
  );
  if (!run) return undefined;

  const counts = await one<RunCounts>(
    db,
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'VERIFIED')::int AS verified,
            count(*) FILTER (WHERE status = 'UNVERIFIED')::int AS unverified,
            count(*) FILTER (WHERE changed)::int AS updated
       FROM refresh_item WHERE run_id = $1`,
    [runId],
  );
  const { rows: unverifiedRecords } = await db.query<UnverifiedRecord>(
    `SELECT i.organization_id, o.name, i.reason_code, i.reason, i.changed
       FROM refresh_item i JOIN organization o ON o.organization_id = i.organization_id
      WHERE i.run_id = $1 AND i.status = 'UNVERIFIED'
      ORDER BY i.seq`,
    [runId],
  );
  return { ...run, ...progress(counts!), unverified_records: unverifiedRecords };
}

/** Past runs, newest first (the app's running count of refreshes). */
export async function listRuns(db: Queryable, limit: number, offset: number): Promise<{ data: RunListItem[]; total: number }> {
  const { rows } = await db.query<Pick<RunSummary, "run_id" | "requested_by" | "created_at" | "finished_at"> & RunCounts>(
    `SELECT r.run_id, r.requested_by, r.created_at, r.finished_at,
            count(i.item_id)::int AS total,
            count(i.item_id) FILTER (WHERE i.status = 'VERIFIED')::int AS verified,
            count(i.item_id) FILTER (WHERE i.status = 'UNVERIFIED')::int AS unverified,
            count(i.item_id) FILTER (WHERE i.changed)::int AS updated
       FROM refresh_run r LEFT JOIN refresh_item i ON i.run_id = r.run_id
      GROUP BY r.run_id
      ORDER BY r.run_id DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  const { rows: total } = await db.query<{ total: number }>("SELECT count(*)::int AS total FROM refresh_run");
  return {
    data: rows.map(({ run_id, requested_by, created_at, finished_at, ...counts }) => ({
      run_id, requested_by, created_at, finished_at, ...progress(counts),
    })),
    total: total[0].total,
  };
}

// ---------- doing the work ----------

export type BatchOptions = { batchSize: number; budgetMs: number };

/**
 * Process the next records of a run, one at a time. Stops after `batchSize` records, or once `budgetMs`
 * has passed (so a request stays inside the host's time limit), whichever comes first.
 */
export async function processBatch(
  pool: Pool,
  deps: RefreshDeps,
  actor: Actor,
  runId: number,
  options: BatchOptions,
): Promise<RunSummary> {
  const started = Date.now();
  for (let done = 0; done < options.batchSize && Date.now() - started < options.budgetMs; done++) {
    const claimed = await one<{ item_id: number; organization_id: number }>(
      pool,
      // One statement: two requests polling at once can never pick the same record.
      `UPDATE refresh_item SET status = 'PROCESSING', claimed_at = now()
        WHERE item_id = (
          SELECT item_id FROM refresh_item
           WHERE run_id = $1
             AND (status = 'PENDING' OR (status = 'PROCESSING' AND claimed_at < now() - interval '${STALE_CLAIM}'))
           ORDER BY seq LIMIT 1
           FOR UPDATE SKIP LOCKED)
        RETURNING item_id, organization_id`,
      [runId],
    );
    if (!claimed) break; // nothing left to do

    let outcome: Outcome;
    try {
      outcome = await refreshOrganization(pool, deps, actor, claimed.organization_id);
    } catch (err) {
      // One failed record never stops the run: it is reported as unverified and the next one starts.
      const message = err instanceof Error ? err.message : String(err);
      outcome = { status: "UNVERIFIED", code: "ERROR", reason: `Unexpected error: ${message}`.slice(0, 300) };
    }
    await pool.query(
      `UPDATE refresh_item SET status = $2, reason_code = $3, reason = $4, changed = $5, processed_at = now() WHERE item_id = $1`,
      [
        claimed.item_id,
        outcome.status,
        outcome.status === "VERIFIED" ? null : outcome.code,
        outcome.status === "VERIFIED" ? null : outcome.reason,
        outcome.changed === true,
      ],
    );
  }

  await pool.query(
    `UPDATE refresh_run SET finished_at = now()
      WHERE run_id = $1 AND finished_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM refresh_item WHERE run_id = $1 AND status IN ('PENDING', 'PROCESSING'))`,
    [runId],
  );
  return (await getRunSummary(pool, runId)) as RunSummary;
}

type Outcome = ({ status: "VERIFIED" } | { status: "UNVERIFIED"; code: ReasonCode; reason: string }) & {
  changed?: boolean; // the refresh saved something on this record
};

type OrganizationRow = {
  organization_id: number;
  name: string;
  website_url: string | null;
  is_flagged: boolean;
  domain_name: string;
};

/** Contacts to refresh: people with a position here. Flagged people and positions are skipped. */
async function loadContacts(db: Queryable, organizationId: number): Promise<StoredContact[]> {
  const { rows } = await db.query<StoredContact>(
    `SELECT p.person_id, pos.position_id, p.first_name, p.middle_name, p.last_name, p.suffix,
            pos.title, pos.phone,
            COALESCE((SELECT jsonb_agg(jsonb_build_object('email_id', e.email_id, 'address', e.address) ORDER BY e.email_id)
                        FROM email e WHERE e.person_id = p.person_id AND NOT e.is_flagged), '[]'::jsonb) AS emails
       FROM "position" pos
       JOIN person p ON p.person_id = pos.person_id
      WHERE pos.organization_id = $1 AND NOT pos.is_flagged AND NOT p.is_flagged
      ORDER BY lower(p.last_name), lower(p.first_name), pos.position_id`,
    [organizationId],
  );
  return rows;
}

function fullName(c: StoredContact): string {
  return [c.first_name, c.middle_name, c.last_name, c.suffix].filter(Boolean).join(" ");
}

function toDiscovery(ranked: RankResult): Discovery {
  return {
    confidence: ranked.confidence,
    url: ranked.confidence === "high" ? ranked.url : null,
    candidates: ranked.confidence === "low" ? ranked.candidates : [],
    confirmOverwrite: false,
  };
}

/** Never lets a lookup throw: a broken lookup is just a reason the contact is unverified. */
async function safeLookup(deps: RefreshDeps, websiteUrl: string, contact: StoredContact): Promise<LookupResult> {
  try {
    return await deps.lookupContact(websiteUrl, {
      firstName: contact.first_name,
      middleName: contact.middle_name ?? undefined,
      lastName: contact.last_name,
      nameSuffix: contact.suffix ?? undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { found: false, code: "SITE_UNREACHABLE", reason: `Lookup failed: ${message}`.slice(0, 200) };
  }
}

/** Whether the website gave us anything we could actually save (a title, a valid email, a 10-digit phone). */
function hasAnyDetail(d: ContactDetails): boolean {
  return Boolean(d.title?.trim() || usableEmail(d.email) || usablePhone(d.phone));
}

/**
 * Refresh one record: find its website if it has none, look up each contact we have, and save what
 * changed. The web requests happen first, outside any transaction; the changes are then written in one
 * transaction, so a record is either fully updated or not touched.
 */
async function refreshOrganization(pool: Pool, deps: RefreshDeps, actor: Actor, organizationId: number): Promise<Outcome> {
  const org = await one<OrganizationRow>(
    pool,
    `SELECT o.organization_id, o.name, o.website_url, o.is_flagged, d.name AS domain_name
       FROM organization o JOIN domain d ON d.domain_id = o.domain_id
      WHERE o.organization_id = $1`,
    [organizationId],
  );
  if (!org || org.is_flagged) {
    return { status: "UNVERIFIED", code: "RECORD_UNAVAILABLE", reason: "The record was flagged as no longer valid before it was processed" };
  }

  // 1. the website
  let websiteUrl = org.website_url;
  let discovery: Discovery | null = null;
  if (!websiteUrl) {
    const usage = await getMonthlyUsage(pool);
    if (usage.limit !== null && usage.used >= usage.limit) {
      return { status: "UNVERIFIED", code: "SEARCH_LIMIT_REACHED", reason: `The monthly web search limit (${usage.limit}) has been reached` };
    }
    let ranked: RankResult;
    try {
      ranked = await deps.findWebsite(org);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: "UNVERIFIED", code: "SEARCH_FAILED", reason: `The website search failed: ${message}`.slice(0, 300) };
    }
    await recordSearch(pool, { organizationId, provider: deps.searchProvider, searchedBy: actor.name });
    discovery = toDiscovery(ranked);
    if (ranked.confidence === "high") websiteUrl = ranked.url;
  }

  // 2. each contact, one at a time (slow: this is where the web requests are made)
  const contacts = await loadContacts(pool, organizationId);
  const lookups = new Map<number, LookupResult>();
  if (websiteUrl) {
    for (const contact of contacts) lookups.set(contact.position_id, await safeLookup(deps, websiteUrl, contact));
  }

  // 3. save everything in one transaction
  const problems: { code: ReasonCode; reason: string }[] = [];
  let changed = false;
  await withTransaction(pool, actor, async (db) => {
    changed = false; // (the transaction runs once; this keeps the flag honest if it is ever retried)
    problems.length = 0;
    if (discovery) {
      try {
        // Records the website (or the candidates to review) as an automatic change.
        if ((await saveDiscoveryResult(db, actor, organizationId, discovery)) === "saved") changed = true;
      } catch (err) {
        // A person set a website while we were searching: theirs wins, and we carry on without it.
        if (!(err instanceof HttpError && err.status === 409)) throw err;
      }
    }

    for (const contact of contacts) {
      const lookup = lookups.get(contact.position_id);
      if (!lookup) continue; // no website to look on
      if (!lookup.found) {
        problems.push({ code: lookup.code, reason: `${fullName(contact)}: ${lookup.reason}` });
        continue;
      }
      if (!hasAnyDetail(lookup.details)) {
        problems.push({ code: "NO_CONTACT_DATA", reason: `${fullName(contact)}: listed on the website, but with no title, email or phone` });
        continue;
      }

      const address = lookup.details.email?.trim().toLowerCase() ?? null;
      const owner = address
        ? await one<{ person_id: number }>(db, "SELECT person_id FROM email WHERE address = $1", [address])
        : undefined;
      const plan = planContact(contact, lookup.details, owner?.person_id ?? null);
      await applyPlan(db, actor, contact, plan);
      if (Object.keys(plan.position).length > 0 || plan.email.kind === "update" || plan.email.kind === "insert") changed = true;
      if (plan.email.kind === "conflict") {
        problems.push({
          code: "EMAIL_BELONGS_TO_OTHER_CONTACT",
          reason: `${fullName(contact)}: the website's email (${plan.email.address}) already belongs to another contact, so it was not saved`,
        });
      }
    }

    if (websiteUrl && problems.length === 0) {
      await updateRow(db, "organization", "organization_id", organizationId, { last_verified_at: new Date().toISOString() }, actor, "REFRESH");
    }
  });

  // 4. the result for the summary
  if (!websiteUrl) {
    return discovery?.confidence === "low"
      ? { status: "UNVERIFIED", code: "WEBSITE_NEEDS_REVIEW", reason: "A website was found, but not with enough confidence; a person needs to pick the right one", changed }
      : { status: "UNVERIFIED", code: "NO_WEBSITE_FOUND", reason: "No website was found for this record", changed };
  }
  if (problems.length > 0) {
    const shown = problems.slice(0, 5).map((p) => p.reason).join("; ");
    const more = problems.length > 5 ? `; and ${problems.length - 5} more` : "";
    return { status: "UNVERIFIED", code: problems[0].code, reason: `${shown}${more}`.slice(0, 1000), changed };
  }
  return { status: "VERIFIED", changed };
}
