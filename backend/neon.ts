// AI use: written by Claude (Claude Code, Sonnet 5.5) at Irene Riva's direction. See "AI use" in backend/README.md.
import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  functions: {
    // The key is the function's slug: permanent, used in CLI commands and the URL.
    api: {
      name: "CHUD API",
      source: "./functions/api.ts",
    },
  },
});
