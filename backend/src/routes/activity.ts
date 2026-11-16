// AI use: written with help from Claude (Anthropic), directed by Rachel Wong. See "AI use" in backend/README.md.
import { Hono } from "hono";
import type { Pool } from "pg";
import { ACTIVITY_ACTIONS, listActivity, type ActivityAction } from "../activity.ts";
import type { AppEnv } from "../app.ts";
import { HttpError } from "../errors.ts";
import { parseId, parsePage } from "../validate.ts";

/** Activity log page (CHUD-38): GET /api/activity?action=FLAGGED&organization_id=3, newest first. */
export function activityRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>();

  routes.get("/activity", async (c) => {
    const { limit, offset } = parsePage((name) => c.req.query(name));
    const action = c.req.query("action") || null;
    if (action !== null && !(ACTIVITY_ACTIONS as readonly string[]).includes(action)) {
      throw new HttpError(400, `action must be one of ${ACTIVITY_ACTIONS.join(", ")}`);
    }
    const orgRaw = c.req.query("organization_id");
    const organizationId = orgRaw ? parseId(orgRaw, "organization_id") : null;
    const { data, total } = await listActivity(
      pool,
      { action: action as ActivityAction | null, organizationId },
      limit,
      offset,
    );
    return c.json({ data, total, limit, offset });
  });

  return routes;
}
