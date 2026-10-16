import { Hono } from "hono";
import type { Pool } from "pg";
import type { AppEnv } from "../app.ts";
import { insertRow, withTransaction } from "../db.ts";
import { readJson } from "../http.ts";
import { parseFields, type Schema } from "../validate.ts";

const DOMAIN_FIELDS: Schema = {
  name: { type: "string", max: 100, required: true },
  description: { type: "string", max: 500 },
};

const DEPARTMENT_FIELDS: Schema = {
  name: { type: "string", max: 150, required: true },
};

/** Drop-down lists the forms need: domains and departments. */
export function lookupRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>();

  routes.get("/domains", async (c) => {
    const { rows } = await pool.query(
      "SELECT domain_id, name, description, is_active FROM domain ORDER BY lower(name)",
    );
    return c.json({ data: rows });
  });

  routes.post("/domains", async (c) => {
    const fields = parseFields(await readJson(c), DOMAIN_FIELDS, "create");
    const row = await withTransaction(pool, c.get("actor"), (db) =>
      insertRow(db, "domain", fields, c.get("actor")),
    );
    return c.json(row, 201);
  });

  routes.get("/departments", async (c) => {
    const { rows } = await pool.query(
      "SELECT department_id, name FROM department ORDER BY lower(name)",
    );
    return c.json({ data: rows });
  });

  routes.post("/departments", async (c) => {
    const fields = parseFields(await readJson(c), DEPARTMENT_FIELDS, "create");
    // department has no audit columns, so insert it directly.
    const { rows } = await pool.query(
      "INSERT INTO department (name) VALUES ($1) RETURNING department_id, name",
      [fields.name],
    );
    return c.json(rows[0], 201);
  });

  return routes;
}
