// AI use: written with AI help from Claude Code (Sonnet 5.5), directed by Irene Riva. See "AI use" in backend/README.md.
import { rankResults } from "../ranking/rank.ts";
import { crawlContact, NOT_FOUND } from "../scrape/scraper.ts";
import { Brave } from "../search.ts";
import type { LookupResult, RefreshDeps } from "./types.ts";

export type ProviderOptions = {
  /** Sent with every request the crawler makes. Set CRAWLER_USER_AGENT to change it. */
  userAgent?: string;
  /** Pause between two page requests to the same site. The crawler never goes below the site's own Crawl-delay. */
  minDelayMs?: number;
};

const DEFAULT_USER_AGENT = "AesireCHUDBot/1.0 (data refresh for Aesire LLC)";

/**
 * The real services a refresh uses. Tests pass their own (see test/refresh.test.ts).
 *
 * Website search: Brave search (CHUD-29), then the ranking from CHUD-48.
 * Contact lookup: the crawler from CHUD-34, which looks up one known contact by name on the entity's website.
 */
export function defaultRefreshDeps(options: ProviderOptions = {}): RefreshDeps {
  const userAgent = options.userAgent ?? process.env.CRAWLER_USER_AGENT ?? DEFAULT_USER_AGENT;

  return {
    searchProvider: "brave",

    async findWebsite(org) {
      const query = [Brave.Operators.explicit(org.name), org.domain_name, "official website"].join(" ");
      const results = await Brave.search(query, { limit: 10, safesearch: false });
      return rankResults(results, { name: org.name });
    },

    async lookupContact(websiteUrl, name): Promise<LookupResult> {
      let result;
      try {
        result = await crawlContact(websiteUrl, name, { userAgent, minDelayMs: options.minDelayMs });
      } catch (err) {
        // The crawler reports most problems in `failures`; this is only an unusable URL or similar.
        return { found: false, code: "SITE_UNREACHABLE", reason: err instanceof Error ? err.message : "The website could not be read" };
      }

      if (!result.found) {
        const why = result.failures.slice(0, 2).map((f) => f.reason).join("; ") || "The contact was not found on the website";
        // No page was read at all: the site was unreachable (or robots.txt kept us out). Otherwise we read pages and the person was not on them.
        return { found: false, code: result.pagesVisited.length === 0 ? "SITE_UNREACHABLE" : "CONTACT_NOT_LISTED", reason: why };
      }
      const value = (text: string) => (text === NOT_FOUND ? null : text);
      const { title, email, phone, sourceUrl } = result.contact;
      return {
        found: true,
        details: { title: value(title), email: value(email), phone: value(phone) },
        sourceUrl,
        matchedBy: result.matchedBy,
      };
    },
  };
}
