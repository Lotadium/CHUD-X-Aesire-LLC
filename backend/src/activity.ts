// AI use: written with help from Claude (Anthropic), directed by Rachel Wong. See "AI use" in backend/README.md.
// Activity log (CHUD-38, charter 2.3 g.ii and g.iii): one row per thing that happened to a record.
// The table is created by DataBase/database_add_activity_log.sql.
import type { Actor, Queryable } from "./db.ts";
import type { Parsed } from "./validate.ts";

export const ACTIVITY_ACTIONS = ["CREATED", "MANUAL_UPDATE", "FLAGGED", "REFRESH_ATTEMPT", "REFRESH_SUCCESS"] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export type RecordType = "organization" | "person" | "position" | "email";

export type ActivityEntry = {
  action: ActivityAction;
  recordType: RecordType;
  recordId: number;
  organizationId?: number | null; // the entity the record belongs to, if known
  personId?: number | null; // the contact the record belongs to, if known
  actor: Actor;
  actorType?: "USER" | "REFRESH"; // USER (a person) unless the refresh made the change
  detail?: string | null;
};

/**
 * Add one entry to the activity log. Pass the same transaction client that made the change,
 * so the entry is only kept if the change is saved.
 */
export async function logActivity(db: Queryable, entry: ActivityEntry): Promise<void> {
  await db.query(
    `INSERT INTO activity_log
       (action, record_type, record_id, organization_id, person_id, actor_type, actor_name, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      entry.action,
      entry.recordType,
      entry.recordId,
      entry.organizationId ?? null,
      entry.personId ?? null,
      entry.actorType ?? "USER",
      entry.actor.name.slice(0, 100),
      entry.detail ? entry.detail.slice(0, 500) : null,
    ],
  );
}

/**
 * Decide how an edit is logged. Setting is_flagged to true is "flagged as no longer valid";
 * every other edit (including removing a flag) is a manual update. The detail lists the fields changed.
 */
export function describeUpdate(fields: Parsed): { action: ActivityAction; detail: string } {
  if (fields.is_flagged === true) {
    return { action: "FLAGGED", detail: `Reason: ${fields.flag_reason ?? "none given"}` };
  }
  const changed = Object.keys(fields).filter((f) => f !== "is_flagged" && f !== "flag_reason");
  const parts: string[] = [];
  if (fields.is_flagged === false) parts.push("Flag removed");
  if (changed.length > 0) parts.push(`Changed: ${changed.join(", ")}`);
  return { action: "MANUAL_UPDATE", detail: parts.join(". ") };
}

export type ActivityFilter = { action: ActivityAction | null; organizationId: number | null };

/**
 * List entries, newest first. The entity filter also matches contacts who work at that entity
 * (entries about a person or their email, which have no entity of their own).
 */
export async function listActivity(db: Queryable, filter: ActivityFilter, limit: number, offset: number) {
  const where = `($1::text IS NULL OR a.action = $1)
    AND ($2::int IS NULL OR a.organization_id = $2
         OR (a.organization_id IS NULL AND EXISTS (
               SELECT 1 FROM "position" x WHERE x.person_id = a.person_id AND x.organization_id = $2)))`;
  const params = [filter.action, filter.organizationId];
  const [{ rows }, total] = await Promise.all([
    db.query(
      `SELECT a.*,
              o.name AS organization_name,
              CASE WHEN p.person_id IS NULL THEN NULL
                   ELSE concat_ws(' ', p.first_name, p.last_name) END AS person_name
       FROM activity_log a
       LEFT JOIN organization o ON o.organization_id = a.organization_id
       LEFT JOIN person p ON p.person_id = a.person_id
       WHERE ${where}
       ORDER BY a.occurred_at DESC, a.activity_id DESC
       LIMIT $3 OFFSET $4`,
      [...params, limit, offset],
    ),
    db.query<{ total: number }>(`SELECT count(*)::int AS total FROM activity_log a WHERE ${where}`, params),
  ]);
  return { data: rows, total: total.rows[0]!.total };
}
