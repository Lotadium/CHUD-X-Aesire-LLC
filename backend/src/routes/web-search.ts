import { Hono } from "hono";
import type { AppEnv } from "../app.ts";
import { readJson } from "../http.ts";
import { type SearchContext, queryBuilder } from "../search/query.ts";
import { Brave } from "../search.ts";

/** searches the web for candidates of an entity's official website */
export function webSearchRoutes() {
  const routes = new Hono<AppEnv>();
  const maxCandidates = 10;
  const safesearchEnabled = false;
  let REQUESTS_MADE: number = 0; // total requests made, tracked to display later

  routes.post("/web-search", async (c) => {
    const body = await readJson(c) as SearchContext;
    if (body.firstName && body.lastName) {
      const query = queryBuilder(body, Brave.Operators);
      try {
        const results = await Brave.search(query, {
          limit: maxCandidates,
          safesearch: safesearchEnabled
        });
        REQUESTS_MADE += 1;
        return c.json(results);
      } catch (error) {
        return c.json({ error: `Failed to access search provider API${ error instanceof Error ? ": " + error.message : ""}`}, 500);
      }
    } else {
      return c.json({ error: "Missing or invalid field(s): firstName, lastName" }, 400);
    }
  });

  return routes;
}
