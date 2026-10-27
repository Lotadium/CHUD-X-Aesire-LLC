// AI use: written with help from Claude (Anthropic), directed by Rachel Wong (CHUD-49).
import { Hono } from "hono";
import type { Pool } from "pg";
import type { AppEnv } from "../app.ts";
import { getMonthlyUsage } from "../searchUsage.ts";
 
/** Web searches used this month, for the records list page (CHUD-49). */
export function searchUsageRoutes(pool: Pool) {
  const routes = new Hono<AppEnv>();
 
  routes.get("/search-usage", async (c) => c.json(await getMonthlyUsage(pool)));
 
  return routes;
}