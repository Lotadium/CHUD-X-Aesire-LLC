// AI use: written with AI help from Claude Code (Sonnet 5.5), directed by Irene Riva. See "AI use" in backend/README.md.
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

/**
 * UPDATE one row by primary key and return it, or undefined if it does not exist.
 *
 * This is the one write path for every change to an existing record, whether a person made it
 * (manual edits) or the refresh did (REFRESH), so every change is versioned the same way (CHUD-36).
 * The database triggers (DataBase/database_add_record_versions.sql) do the versioning:
 * - a real change bumps `version` and `date_last_updated` and copies the new row into record_history;
 * - sending the values the record already has creates no version and no history row.
 * A person's save (USER) also confirms the record, so `last_verified_at` is set to now either way.
 * A REFRESH save does not: the refresh calls `verifyRow` when it has actually confirmed the record.
 */
export async function updateRow<T extends QueryResultRow>(
  db: Queryable,
  table: string,
  idColumn: string,
  id: number,
  fields: Parsed,
  actor: Actor,
  changedBy: "USER" | "REFRESH" = "USER", // REFRESH marks a change made automatically, not by a person
): Promise<T | undefined> {
  const entries = [...Object.entries(fields), ["updated_by_type", changedBy], ["updated_by", actor.name]] as const;
  const assignments = entries.map(([column], i) => `${column} = $${i + 1}`);
  if (changedBy === "USER") assignments.push("last_verified_at = now()");
  const values = [...entries.map(([, value]) => value), id];
  const { rows } = await db.query<T>(
    `UPDATE "${table}" SET ${assignments.join(", ")}
     WHERE ${idColumn} = $${values.length} RETURNING *`,
    values,
  );
  return rows[0];
}

/**
 * Confirm a record is still correct without changing it: sets `last_verified_at` to now.
 * This is how the refresh (CHUD-35) marks a record verified. It creates no version and no history row.
 * Returns the row, or undefined if it does not exist.
 */
export async function verifyRow<T extends QueryResultRow>(
  db: Queryable,
  table: string,
  idColumn: string,
  id: number,
): Promise<T | undefined> {
  const { rows } = await db.query<T>(
    `UPDATE "${table}" SET last_verified_at = now() WHERE ${idColumn} = $1 RETURNING *`,
    [id],
  );
  return rows[0];
}
