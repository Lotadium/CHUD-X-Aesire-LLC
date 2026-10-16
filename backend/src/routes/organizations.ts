import { Hono, type Context } from "hono";
import type { Pool } from "pg";
import type { AppEnv } from "../app.ts";
import { insertRow, one, updateRow, withTransaction, type Queryable } from "../db.ts";
import { HttpError } from "../errors.ts";
import { notFound, readJson } from "../http.ts";
import { parseFields, parseId, parsePage, type Schema } from "../validate.ts";

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
    const fields = parseFields(await readJson(c), ORGANIZATION_FIELDS, "update");
    const organization = await withTransaction(pool, actor, async (db) => {
      const row = await updateRow(db, "organization", "organization_id", id, fields, actor);
      return row ? getOrganization(db, id) : undefined;
    });
    if (!organization) throw notFound("Organization");
    return c.json(organization);
  };
  routes.put("/organizations/:id", update);
  routes.patch("/organizations/:id", update);

  // Deleting an organization that still has contacts needs ?force=true, which also
  // removes those contact positions (the people themselves are kept).
  routes.delete("/organizations/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    const force = c.req.query("force") === "true";

    await withTransaction(pool, c.get("actor"), async (db) => {
      if (!(await one(db, "SELECT 1 FROM organization WHERE organization_id = $1 FOR UPDATE", [id]))) {
        throw notFound("Organization");
      }
      const { rows } = await db.query(
        'SELECT count(*)::int AS n FROM "position" WHERE organization_id = $1',
        [id],
      );
      const positions: number = rows[0].n;
      if (positions > 0 && !force) {
        throw new HttpError(
          409,
          `Organization still has ${positions} contact position(s). Remove them first, or retry with ?force=true to delete them too`,
        );
      }
      if (positions > 0) await db.query('DELETE FROM "position" WHERE organization_id = $1', [id]);
      await db.query("DELETE FROM organization WHERE organization_id = $1", [id]);
    });
    return c.body(null, 204);
  });

  return routes;
}
