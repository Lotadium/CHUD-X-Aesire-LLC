// AI use: written with AI help from Claude Code (Sonnet 5.5), directed by Irene Riva. See "AI use" in backend/README.md.
import { Hono } from "hono";
import type { Pool } from "pg";
import type { AppEnv } from "../app.ts";
import { HttpError } from "../errors.ts";
import { notFound, readJson } from "../http.ts";
import { createRun, getRunSummary, listRuns, processBatch, type Selection } from "../refresh/run.ts";
import type { RefreshDeps } from "../refresh/types.ts";
import { parseId, parsePage } from "../validate.ts";

const DEFAULT_BATCH = 3;
const MAX_BATCH = 10;
const MAX_RECORDS_PER_RUN = 5000;

/** How long one /process request may keep starting new records (ms). Set REFRESH_TIME_BUDGET_MS to change it. */
function timeBudgetMs(): number {
  const n = Number(process.env.REFRESH_TIME_BUDGET_MS);
  return Number.isFinite(n) && n > 0 ? n : 20_000;
}

/** Exactly one of organization_ids, domain_id or all must be sent. */
function parseSelection(body: unknown): Selection {
  const raw = (typeof body === "object" && body !== null && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const given = ["organization_ids", "domain_id", "all"].filter((key) => raw[key] !== undefined && raw[key] !== null);
  if (given.length !== 1) {
    throw new HttpError(400, "Send exactly one of organization_ids, domain_id or all", {
      selection: "choose which records to refresh",
    });
  }

  if (raw.organization_ids !== undefined) {
    const ids = raw.organization_ids;
    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      ids.length > MAX_RECORDS_PER_RUN ||
      !ids.every((id) => Number.isSafeInteger(id) && id >= 1 && id <= 2147483647)
    ) {
      throw new HttpError(400, "Invalid organization_ids", {
        organization_ids: `must be a list of 1 to ${MAX_RECORDS_PER_RUN} positive whole numbers`,
      });
    }
    return { organizationIds: [...new Set(ids as number[])] };
  }
  if (raw.domain_id !== undefined) {
    const id = raw.domain_id;
    if (!Number.isSafeInteger(id) || (id as number) < 1 || (id as number) > 2147483647) {
      throw new HttpError(400, "Invalid domain_id", { domain_id: "must be a positive whole number" });
    }
    return { domainId: id as number };
  }
  if (raw.all !== true) throw new HttpError(400, "Invalid all", { all: "must be true" });
  return { all: true };
}

/** Data refresh (CHUD-35): start a run, process it in small batches, read its progress. */
export function refreshRoutes(pool: Pool, deps: RefreshDeps) {
  const routes = new Hono<AppEnv>();

  // Past runs, newest first: how many refreshes have been done, by whom, and how they went.
  routes.get("/refresh", async (c) => {
    const { limit, offset } = parsePage((name) => c.req.query(name));
    const { data, total } = await listRuns(pool, limit, offset);
    return c.json({ data, total, limit, offset });
  });

  // Start a run: choose the records, no work yet. Returns the run with its total.
  routes.post("/refresh", async (c) => {
    const selection = parseSelection(await readJson(c));
    const run = await createRun(pool, c.get("actor"), selection);
    return c.json(run, 201);
  });

  // Do the next few records of a run. The front end calls this over and over (the progress bar) until
  // status is COMPLETE. Safe to call again at any time, including after a failure: finished records are not redone.
  routes.post("/refresh/:id/process", async (c) => {
    const id = parseId(c.req.param("id"));
    let batchSize = DEFAULT_BATCH;
    const text = await c.req.text();
    if (text.trim() !== "") {
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new HttpError(400, "Request body must be valid JSON");
      }
      const requested = (body as { batch_size?: unknown } | null)?.batch_size;
      if (requested !== undefined) {
        if (!Number.isSafeInteger(requested) || (requested as number) < 1 || (requested as number) > MAX_BATCH) {
          throw new HttpError(400, "Invalid batch_size", { batch_size: `must be a whole number from 1 to ${MAX_BATCH}` });
        }
        batchSize = requested as number;
      }
    }
    if (!(await getRunSummary(pool, id))) throw notFound("Refresh run");
    return c.json(await processBatch(pool, deps, c.get("actor"), id, { batchSize, budgetMs: timeBudgetMs() }));
  });

  // Progress (processed / total) and, once finished, the verified count and the unverified records with reasons.
  routes.get("/refresh/:id", async (c) => {
    const summary = await getRunSummary(pool, parseId(c.req.param("id")));
    if (!summary) throw notFound("Refresh run");
    return c.json(summary);
  });

  return routes;
}
