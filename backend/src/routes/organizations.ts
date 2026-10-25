// AI use: written with AI help from Claude Code (Sonnet 5.5), directed by Irene Riva. See "AI use" in backend/README.md.
import { Hono, type Context } from "hono";
import type { Pool } from "pg";
import type { AppEnv } from "../app.ts";
import { insertRow, one, updateRow, withTransaction, type Queryable } from "../db.ts";
import { HttpError } from "../errors.ts";
import { notFound, readJson } from "../http.ts";
import { parseFields, parseId, parsePage, parseUpdate, type Parsed, type Schema } from "../validate.ts";
import { applyWebsiteChange, parseDiscovery, rejectCandidates, saveDiscoveryResult } from "../website.ts";

const ORGANIZATION_FIELDS: Schema = {
  domain_id: { type: "int", required: true },
  name: { type: "string", max: 250, required: true },
  website_url: { type: "string", max: 400, format: "url" },
};

// Sent with a website change to confirm replacing (or clearing) a URL that is already set.
const CONFIRM_FIELD: Schema = { confirm_overwrite: { type: "bool" } };

// Body of PUT /organizations/:id/website
const WEBSITE_FIELDS: Schema = {
  url: { type: "string", max: 400, format: "url", required: true },
  ...CONFIRM_FIELD,
};

// Every organization response also carries website_candidates: the URLs waiting for review
// (best first, at most 3), or an empty list.
const ORGANIZATION_SELECT = `
  SELECT o.*, d.name AS domain_name,
    COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object('candidate_id', c.candidate_id, 'url', c.url,
                                  'page_title', c.page_title, 'score', c.score, 'rank', c.rank)
               ORDER BY c.rank)
      FROM website_candidate c
      WHERE c.organization_id = o.organization_id), '[]'::jsonb) AS website_candidates
  FROM organization o
  JOIN domain d ON d.domain_id = o.domain_id`;

const WEBSITE_STATUSES = ["NOT_SEARCHED", "FOUND", "NEEDS_REVIEW", "NOT_FOUND"];

async function getOrganization(db: Queryable, id: number) {
  return one(db, `${ORGANIZATION_SELECT} WHERE o.organization_id = $1`, [id]);
}

/** Entities: an organization, its domain, and (on the detail view) the contacts who work there. */
export function organizationRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>();

  routes.get("/organizations", async (c) => {
    const { limit, offset } = parsePage((name) => c.req.query(name));
    const domainRaw = c.req.query("domain_id");
    const domainId = domainRaw === undefined ? null : parseId(domainRaw, "domain_id");
    const status = c.req.query("website_status") ?? null;
    if (status !== null && !WEBSITE_STATUSES.includes(status)) {
      throw new HttpError(400, `website_status must be one of ${WEBSITE_STATUSES.join(", ")}`);
    }
    const filter = "($1::int IS NULL OR o.domain_id = $1) AND ($2::text IS NULL OR o.website_status = $2)";

    const [{ rows }, total] = await Promise.all([
      pool.query(
        `${ORGANIZATION_SELECT}
         WHERE ${filter}
         ORDER BY lower(o.name), o.organization_id
         LIMIT $3 OFFSET $4`,
        [domainId, status, limit, offset],
      ),
      pool.query(`SELECT count(*)::int AS total FROM organization o WHERE ${filter}`, [domainId, status]),
    ]);
    return c.json({ data: rows, total: total.rows[0].total, limit, offset });
  });

  routes.get("/organizations/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    const organization = await getOrganization(pool, id);
    if (!organization) throw notFound("Organization");

    const { rows: contacts } = await pool.query(
      `SELECT pos.position_id, pos.title, pos.additional_title,
              pos.department_id, dep.name AS department_name,
              p.person_id, p.prefix, p.first_name, p.middle_name, p.last_name, p.suffix
       FROM "position" pos
       JOIN person p ON p.person_id = pos.person_id
       LEFT JOIN department dep ON dep.department_id = pos.department_id
       WHERE pos.organization_id = $1
       ORDER BY lower(p.last_name), lower(p.first_name), pos.position_id`,
      [id],
    );
    return c.json({ ...organization, contacts });
  });

  routes.post("/organizations", async (c) => {
    const actor = c.get("actor");
    const fields = parseFields(await readJson(c), ORGANIZATION_FIELDS, "create");
    const organization = await withTransaction(pool, actor, async (db) => {
      const row = await insertRow<{ organization_id: number }>(db, "organization", fields, actor);
      return getOrganization(db, row.organization_id);
    });
    return c.json(organization, 201);
  });

  const update = async (c: Context<AppEnv>) => {
    const actor = c.get("actor");
    const id = parseId(c.req.param("id"));
    const { confirm_overwrite, ...fields } = parseUpdate(await readJson(c), {
      ...ORGANIZATION_FIELDS,
      ...CONFIRM_FIELD,
    });
    const organization = await withTransaction(pool, actor, async (db) => {
      // Changing the website follows the same rules as the website endpoint below.
      if ("website_url" in fields) await applyWebsiteChange(db, id, fields, confirm_overwrite === true);
      if (Object.keys(fields).length > 0) {
        const row = await updateRow(db, "organization", "organization_id", id, fields, actor);
        if (!row) return undefined;
      }
      return getOrganization(db, id);
    });
    if (!organization) throw notFound("Organization");
    return c.json(organization);
  };
  routes.put("/organizations/:id", update);
  routes.patch("/organizations/:id", update);

  // Set the website by hand (the review screen and the entity page use this).
  // If the entity already has a different website, send confirm_overwrite: true to replace it.
  routes.put("/organizations/:id/website", async (c) => {
    const actor = c.get("actor");
    const id = parseId(c.req.param("id"));
    const body = parseFields(await readJson(c), WEBSITE_FIELDS, "create");
    const fields: Parsed = { website_url: body.url };
    const organization = await withTransaction(pool, actor, async (db) => {
      await applyWebsiteChange(db, id, fields, body.confirm_overwrite === true);
      if (Object.keys(fields).length > 0) {
        await updateRow(db, "organization", "organization_id", id, fields, actor);
      }
      return getOrganization(db, id);
    });
    return c.json(organization);
  });

  // "None of these suggestions is right" (review screen). Keeps an existing website, or marks NOT_FOUND.
  routes.post("/organizations/:id/website/reject-candidates", async (c) => {
    const actor = c.get("actor");
    const id = parseId(c.req.param("id"));
    const organization = await withTransaction(pool, actor, async (db) => {
      await rejectCandidates(db, actor, id);
      return getOrganization(db, id);
    });
    return c.json(organization);
  });

  // Save the result of website discovery (the search + ranking steps call this).
  // Returns what happened: saved, needs_review, no_match or unchanged.
  routes.post("/organizations/:id/website/discovery", async (c) => {
    const actor = c.get("actor");
    const id = parseId(c.req.param("id"));
    const input = parseDiscovery(await readJson(c));
    const body = await withTransaction(pool, actor, async (db) => {
      const result = await saveDiscoveryResult(db, actor, id, input);
      return { result, organization: await getOrganization(db, id) };
    });
    return c.json(body);
  });

  return routes;
}
