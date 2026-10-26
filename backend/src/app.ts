// AI use: written by Claude (Claude Code, Sonnet 5.5) at Irene Riva's direction. See "AI use" in backend/README.md.
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Pool } from "pg";
import type { Actor } from "./db.ts";
import { toHttpError } from "./errors.ts";
import { lookupRoutes } from "./routes/lookups.ts";
import { organizationRoutes } from "./routes/organizations.ts";
import { peopleRoutes } from "./routes/people.ts";
import { webSearchRoutes } from "./routes/web-search.ts";

export type AppEnv = { Variables: { actor: Actor } };

/**
 * Build the API. The pool is passed in so tests can point it at a throwaway
 * database and the deployed function can use the Neon one.
 */
export function createApp(pool: Pool) {
  const app = new Hono<AppEnv>();

  // The front end is served from a different origin (Cloudflare), so allow it.
  // Set CORS_ORIGIN to a comma-separated list of allowed origins; defaults to any (dev).
  const origins = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);
  app.use(
    "*",
    cors({
      origin: origins && origins.length > 0 ? origins : "*",
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "X-User"],
    }),
  );

  // Until sign-in exists (sprint 7), the caller identifies itself with an X-User header.
  app.use("/api/*", async (c, next) => {
    const name = (c.req.header("X-User") ?? "").trim().slice(0, 100) || "unknown";
    c.set("actor", { name });
    await next();
  });

  app.get("/api/health", async (c) => {
    await pool.query("SELECT 1");
    return c.json({ status: "ok" });
  });

  app.route("/api", lookupRoutes(pool));
  app.route("/api", organizationRoutes(pool));
  app.route("/api", peopleRoutes(pool));
  app.route("/api", webSearchRoutes());

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  app.onError((err, c) => {
    const httpError = toHttpError(err);
    if (httpError.status >= 500) console.error(err);
    const body: { error: string; fields?: Record<string, string> } = { error: httpError.message };
    if (httpError.fields) body.fields = httpError.fields;
    return c.json(body, httpError.status as ContentfulStatusCode);
  });

  return app;
}
