// AI use: written by Claude (Claude Code, Sonnet 5.5) at Irene Riva's direction. See "AI use" in backend/README.md.
import { attachDatabasePool } from "@neon/functions";
import { Pool } from "pg";
import { createApp } from "../src/app.ts";

// Create the pool once at module scope so it is reused across requests.
// DATABASE_URL is injected by Neon (and by `neon dev` locally); never hard-code it.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString, max: 5 });
attachDatabasePool(pool);

export default createApp(pool);
