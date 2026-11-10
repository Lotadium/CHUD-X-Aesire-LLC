// AI use: written with AI help from Claude Code (Opus 5.5), directed by Ryan Griffiths. See "AI use" in backend/README.md.
import type { Queryable } from "./db.ts";

/**
 * Version history of a record (CHUD-36, charter 2.3 c.viii).
 *
 * The database triggers copy a row into record_history every time it is created or really
 * changed (DataBase/database_add_record_versions.sql), so version N's saved row holds the values
 * after that change and version N-1's holds the values before it. This reads those rows back,
 * newest first, and works out what each version changed.
 */

/** Columns that describe a change rather than the record itself; they are left out of `changes`. */
export const AUDIT_FIELDS = [
  "version",
  "date_created",
  "date_last_updated",
  "last_verified_at",
  "updated_by",
  "updated_by_type",
];

export type Change = { field: string; from: unknown; to: unknown };

export type HistoryEntry = {
  history_id: number;
  record: string; // the table: organization, person, position or email
  row_id: number;
  version: number;
  operation: "INSERT" | "UPDATE" | "DELETE";
  changed_at: string;
  changed_by_type: "USER" | "REFRESH";
  changed_by: string | null;
  /** What this version changed compared with the previous one (empty for the first version). */
  changes: Change[];
  /** The whole record as it was after this change. */
  data: Record<string, unknown>;
};

type Row = Record<string, unknown>;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The fields that differ between two saved versions of a record, ignoring the audit columns.
 * With no previous version (the record was just created) there is nothing to compare, so no changes.
 */
export function diffVersions(previous: Row | null, current: Row): Change[] {
  if (!previous) return [];
  const fields = new Set([...Object.keys(previous), ...Object.keys(current)]);
  const changes: Change[] = [];
  for (const field of fields) {
    if (AUDIT_FIELDS.includes(field)) continue;
    if (!same(previous[field], current[field])) {
      changes.push({ field, from: previous[field] ?? null, to: current[field] ?? null });
    }
  }
  return changes;
}

/**
 * Which history to read. `table` and `column` come from code, never from the request.
 *   { table: "organization", rowId: 5 }                        one record
 *   { table: "position", column: "person_id", value: 7 }        every position of person 7
 */
export type HistorySource =
  | { table: string; rowId: number }
  | { table: string; column: string; value: number };

type HistoryRow = Omit<HistoryEntry, "record" | "changes" | "data"> & { table_name: string; row_data: Row };

/** Every saved version of the given records, newest first, each with what it changed. */
export async function getHistory(db: Queryable, sources: HistorySource[]): Promise<HistoryEntry[]> {
  if (sources.length === 0) return [];
  const params: unknown[] = [];
  const conditions = sources.map((source) => {
    params.push(source.table);
    const table = `table_name = $${params.length}`;
    if ("rowId" in source) {
      params.push(source.rowId);
      return `(${table} AND row_id = $${params.length})`;
    }
    params.push(source.value);
    return `(${table} AND (row_data ->> '${source.column}')::int = $${params.length})`;
  });

  // Oldest first, so each version can be compared with the one before it.
  const { rows } = await db.query<HistoryRow>(
    `SELECT history_id::int, table_name, row_id, version, operation,
            changed_at, changed_by_type, changed_by, row_data
     FROM record_history
     WHERE ${conditions.join(" OR ")}
     ORDER BY history_id`,
    params,
  );

  const latest = new Map<string, Row>(); // the last version seen so far of each record
  const entries = rows.map((row): HistoryEntry => {
    const key = `${row.table_name}:${row.row_id}`;
    const entry: HistoryEntry = {
      history_id: row.history_id,
      record: row.table_name,
      row_id: row.row_id,
      version: row.version,
      operation: row.operation,
      changed_at: row.changed_at,
      changed_by_type: row.changed_by_type,
      changed_by: row.changed_by,
      changes: diffVersions(latest.get(key) ?? null, row.row_data),
      data: row.row_data,
    };
    latest.set(key, row.row_data);
    return entry;
  });

  return entries.reverse(); // newest first
}
