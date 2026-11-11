// AI use: written by Claude (Claude Code, Sonnet 5.5) at Irene Riva's direction. See "AI use" in backend/README.md.
import { Hono, type Context } from "hono";
import type { Pool } from "pg";
import type { AppEnv } from "../app.ts";
import { insertRow, one, updateRow, withTransaction, type Queryable } from "../db.ts";
import type { FieldErrors } from "../errors.ts";
import { getHistory } from "../history.ts";
import { notFound, readJson } from "../http.ts";
import {
  collectFields,
  failIfInvalid,
  parseFields,
  parseId,
  parsePage,
  parseUpdate,
  type Parsed,
  type Schema,
} from "../validate.ts";

const PERSON_FIELDS: Schema = {
  prefix: { type: "string", max: 20 },
  first_name: { type: "string", max: 100, required: true },
  middle_name: { type: "string", max: 100 },
  last_name: { type: "string", max: 100, required: true },
  suffix: { type: "string", max: 20 },
  linkedin_url: { type: "string", max: 300, format: "url" },
};

const POSITION_FIELDS: Schema = {
  organization_id: { type: "int", required: true },
  department_id: { type: "int" },
  title: { type: "string", max: 300 },
  additional_title: { type: "string", max: 300 },
  phone: { type: "string", max: 30 },
  phone_ext: { type: "string", max: 10 },
  mobile_phone: { type: "string", max: 30 },
  fax: { type: "string", max: 30 },
};

const EMAIL_FIELDS: Schema = {
  address: { type: "string", max: 300, required: true, format: "email" },
};

const MAX_NESTED = 50;

/** The email table also stores the domain and TLD "entered with record". */
export function withEmailParts(fields: Parsed): Parsed {
  if (typeof fields.address !== "string") return fields;
  const domain = fields.address.slice(fields.address.lastIndexOf("@") + 1);
  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  return { ...fields, email_domain: domain, email_tld: tld };
}

// A contact is a person plus their positions (job at an organization) and email addresses.
const PERSON_SELECT = `
  SELECT p.*,
    COALESCE((
      SELECT jsonb_agg(
               to_jsonb(pos) || jsonb_build_object('organization_name', o.name, 'department_name', dep.name)
               ORDER BY pos.position_id)
      FROM "position" pos
      JOIN organization o ON o.organization_id = pos.organization_id
      LEFT JOIN department dep ON dep.department_id = pos.department_id
      WHERE pos.person_id = p.person_id), '[]'::jsonb) AS positions,
    COALESCE((
      SELECT jsonb_agg(to_jsonb(e) ORDER BY e.email_id)
      FROM email e
      WHERE e.person_id = p.person_id), '[]'::jsonb) AS emails
  FROM person p`;

const POSITION_SELECT = `
  SELECT pos.*, o.name AS organization_name, dep.name AS department_name
  FROM "position" pos
  JOIN organization o ON o.organization_id = pos.organization_id
  LEFT JOIN department dep ON dep.department_id = pos.department_id`;

async function getPerson(db: Queryable, id: number) {
  return one(db, `${PERSON_SELECT} WHERE p.person_id = $1`, [id]);
}

async function requirePerson(db: Queryable, id: number) {
  if (!(await one(db, "SELECT 1 FROM person WHERE person_id = $1", [id]))) throw notFound("Person");
}

/** Validate an optional array of nested objects, collecting errors as `positions[0].title` etc. */
function collectNested(
  input: unknown,
  name: string,
  schema: Schema,
  errors: FieldErrors,
): Parsed[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) {
    errors[name] = "must be a list";
    return [];
  }
  if (input.length > MAX_NESTED) {
    errors[name] = `must have at most ${MAX_NESTED} items`;
    return [];
  }
  return input.map((item, i) => collectFields(item, schema, "create", errors, `${name}[${i}].`));
}

/** Contacts: people with their positions and email addresses. */
export function peopleRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>();

  // ---- people ----

  routes.get("/people", async (c) => {
    const { limit, offset } = parsePage((name) => c.req.query(name));
    const orgRaw = c.req.query("organization_id");
    const organizationId = orgRaw === undefined ? null : parseId(orgRaw, "organization_id");
    const filter = `($1::int IS NULL OR EXISTS (
        SELECT 1 FROM "position" x WHERE x.person_id = p.person_id AND x.organization_id = $1))`;

    const [{ rows }, total] = await Promise.all([
      pool.query(
        `${PERSON_SELECT}
         WHERE ${filter}
         ORDER BY lower(p.last_name), lower(p.first_name), p.person_id
         LIMIT $2 OFFSET $3`,
        [organizationId, limit, offset],
      ),
      pool.query(`SELECT count(*)::int AS total FROM person p WHERE ${filter}`, [organizationId]),
    ]);
    return c.json({ data: rows, total: total.rows[0].total, limit, offset });
  });

  routes.get("/people/:id", async (c) => {
    const person = await getPerson(pool, parseId(c.req.param("id")));
    if (!person) throw notFound("Person");
    return c.json(person);
  });

  // Every saved version of the contact, newest first (CHUD-36): the person and their
  // positions and emails together. `record` on each entry says which one changed.
  routes.get("/people/:id/history", async (c) => {
    const id = parseId(c.req.param("id"));
    await requirePerson(pool, id);
    const data = await getHistory(pool, [
      { table: "person", rowId: id },
      { table: "position", column: "person_id", value: id },
      { table: "email", column: "person_id", value: id },
    ]);
    return c.json({ data });
  });

  // Create a person, optionally with positions and emails, in one go (all or nothing).
  routes.post("/people", async (c) => {
    const actor = c.get("actor");
    const body = await readJson(c);
    const errors: FieldErrors = {};
    const personFields = collectFields(body, PERSON_FIELDS, "create", errors);
    const raw = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
    const positions = collectNested(raw.positions, "positions", POSITION_FIELDS, errors);
    const emails = collectNested(raw.emails, "emails", EMAIL_FIELDS, errors);
    failIfInvalid(errors);

    const person = await withTransaction(pool, actor, async (db) => {
      const created = await insertRow<{ person_id: number }>(db, "person", personFields, actor);
      for (const position of positions) {
        await insertRow(db, "position", { ...position, person_id: created.person_id }, actor);
      }
      for (const email of emails) {
        await insertRow(db, "email", { ...withEmailParts(email), person_id: created.person_id }, actor);
      }
      return getPerson(db, created.person_id);
    });
    return c.json(person, 201);
  });

  const updatePerson = async (c: Context<AppEnv>) => {
    const actor = c.get("actor");
    const id = parseId(c.req.param("id"));
    const fields = parseUpdate(await readJson(c), PERSON_FIELDS);
    const person = await withTransaction(pool, actor, async (db) => {
      const row = await updateRow(db, "person", "person_id", id, fields, actor);
      return row ? getPerson(db, id) : undefined;
    });
    if (!person) throw notFound("Person");
    return c.json(person);
  };
  routes.put("/people/:id", updatePerson);
  routes.patch("/people/:id", updatePerson);

  // ---- positions ----

  routes.post("/people/:id/positions", async (c) => {
    const actor = c.get("actor");
    const personId = parseId(c.req.param("id"));
    const fields = parseFields(await readJson(c), POSITION_FIELDS, "create");
    const position = await withTransaction(pool, actor, async (db) => {
      await requirePerson(db, personId);
      const row = await insertRow<{ position_id: number }>(
        db,
        "position",
        { ...fields, person_id: personId },
        actor,
      );
      return one(db, `${POSITION_SELECT} WHERE pos.position_id = $1`, [row.position_id]);
    });
    return c.json(position, 201);
  });

  const updatePosition = async (c: Context<AppEnv>) => {
    const actor = c.get("actor");
    const id = parseId(c.req.param("id"));
    const fields = parseUpdate(await readJson(c), POSITION_FIELDS);
    const position = await withTransaction(pool, actor, async (db) => {
      const row = await updateRow(db, "position", "position_id", id, fields, actor);
      return row ? one(db, `${POSITION_SELECT} WHERE pos.position_id = $1`, [id]) : undefined;
    });
    if (!position) throw notFound("Position");
    return c.json(position);
  };
  routes.put("/positions/:id", updatePosition);
  routes.patch("/positions/:id", updatePosition);

  // ---- emails ----

  routes.post("/people/:id/emails", async (c) => {
    const actor = c.get("actor");
    const personId = parseId(c.req.param("id"));
    const fields = withEmailParts(parseFields(await readJson(c), EMAIL_FIELDS, "create"));
    const email = await withTransaction(pool, actor, async (db) => {
      await requirePerson(db, personId);
      return insertRow(db, "email", { ...fields, person_id: personId }, actor);
    });
    return c.json(email, 201);
  });

  const updateEmail = async (c: Context<AppEnv>) => {
    const actor = c.get("actor");
    const id = parseId(c.req.param("id"));
    const fields = withEmailParts(parseUpdate(await readJson(c), EMAIL_FIELDS));
    const email = await withTransaction(pool, actor, (db) =>
      updateRow(db, "email", "email_id", id, fields, actor),
    );
    if (!email) throw notFound("Email");
    return c.json(email);
  };
  routes.put("/emails/:id", updateEmail);
  routes.patch("/emails/:id", updateEmail);

  return routes;
}
