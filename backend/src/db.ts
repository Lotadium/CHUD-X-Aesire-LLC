// AI use: written by Claude (Claude Code, Sonnet 5.5) at Irene Riva's direction. See "AI use" in backend/README.md.
import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { Parsed } from "./validate.ts";

export type Queryable = Pick<Pool | PoolClient, "query">;

/** Who is making a change. Real sign-in comes in a later sprint; until then clients send `X-User`. */
export type Actor = { name: string };

/**
 * Run `fn` inside a transaction. The actor is stored in `app.changed_by` so the
 * history trigger can record who made a change (including deletes).
 */
export async function withTransaction<T>(
  pool: Pool,
  actor: Actor,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.changed_by', $1, true)", [actor.name]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function one<T extends QueryResultRow>(
  db: Queryable,
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const { rows } = await db.query<T>(text, params);
  return rows[0];
}

/** Columns every write sets so the audit trail knows a person (not the refresh job) made the change. */
const AUDIT_COLUMNS = ["updated_by_type", "updated_by"] as const;

/**
 * INSERT one row and return it. `table` and the keys of `fields` come from
 * code (never from the request), so they are safe to interpolate.
 */
export async function insertRow<T extends QueryResultRow>(
  db: Queryable,
  table: string,
  fields: Parsed,
  actor: Actor,
): Promise<T> {
  const columns = [...Object.keys(fields), ...AUDIT_COLUMNS];
  const values = [...Object.values(fields), "USER", actor.name];
  const placeholders = values.map((_, i) => `$${i + 1}`);
  const { rows } = await db.query<T>(
    `INSERT INTO "${table}" (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    values,
  );
  return rows[0]!;
}

/** UPDATE one row by primary key and return it, or undefined if it does not exist. */
export async function updateRow<T extends QueryResultRow>(
  db: Queryable,
  table: string,
  idColumn: string,
  id: number,
  fields: Parsed,
  actor: Actor,
): Promise<T | undefined> {
  const entries = [...Object.entries(fields), ["updated_by_type", "USER"], ["updated_by", actor.name]] as const;
  const assignments = entries.map(([column], i) => `${column} = $${i + 1}`);
  const values = [...entries.map(([, value]) => value), id];
  const { rows } = await db.query<T>(
    `UPDATE "${table}" SET ${assignments.join(", ")} WHERE ${idColumn} = $${values.length} RETURNING *`,
    values,
  );
  return rows[0];
}
