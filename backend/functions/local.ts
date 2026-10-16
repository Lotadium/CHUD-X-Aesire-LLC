// Runs the same API as functions/api.ts on a plain Node server, without the Neon CLI.
//   npm run local     (reads DATABASE_URL from backend/.env)
import { serve } from "@hono/node-server";
import app from "./api.ts";

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`CHUD API listening on http://localhost:${port}`);
});
