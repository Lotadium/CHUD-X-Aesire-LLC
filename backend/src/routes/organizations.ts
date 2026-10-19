// AI use: written by Claude (Claude Code, Sonnet 5.5) at Irene Riva's direction. See "AI use" in backend/README.md.
import { Hono, type Context } from "hono";
import type { Pool } from "pg";
import type { AppEnv } from "../app.ts";
import { insertRow, one, updateRow, withTransaction, type Queryable } from "../db.ts";
import { notFound, readJson } from "../http.ts";
import { parseFields, parseId, parsePage, parseUpdate, type Schema } from "../validate.ts";

const ORGANIZATION_FIELDS: Schema = {
  domain_id: { type: "int", required: true },
  name: { type: "string", max: 250, required: true },
  website_url: { type: "string", max: 400, format: "url" },
};

const ORGANIZATION_SELECT = `
  SELECT o.*, d.name AS domain_name
  FROM organization o
  JOIN domain d ON d.domain_id = o.domain_id`;

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

    const [{ rows }, total] = await Promise.all([
      pool.query(
        `${ORGANIZATION_SELECT}
         WHERE ($1::int IS NULL OR o.domain_id = $1)
         ORDER BY lower(o.name), o.organization_id
         LIMIT $2 OFFSET $3`,
        [domainId, limit, offset],
      ),
      pool.query(
        "SELECT count(*)::int AS total FROM organization WHERE ($1::int IS NULL OR domain_id = $1)",
        [domainId],
      ),
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
    const fields = parseUpdate(await readJson(c), ORGANIZATION_FIELDS);
    const organization = await withTransaction(pool, actor, async (db) => {
      const row = await updateRow(db, "organization", "organization_id", id, fields, actor);
      return row ? getOrganization(db, id) : undefined;
    });
    if (!organization) throw notFound("Organization");
    return c.json(organization);
  };
  routes.put("/organizations/:id", update);
  routes.patch("/organizations/:id", update);

  return routes;
}
