// AI use: written with AI help from Claude Code (Opus 5.5), directed by Ryan Griffiths. See "AI use" in backend/README.md.
//
// CHUD-48: given the search results from CHUD-29, score each candidate and choose
// the most likely official website for the entity. Low-confidence results are flagged
// for manual review instead of being saved automatically (Charter 2.3 b, c.vi).
//
// Each candidate is scored on:
//   - entity name match in the page title or the domain
//   - official-looking domains (.gov, .ca.gov, .us, .org)
//   - county or district keywords
// Known non-official sites (directories, news, social media, Wikipedia) score low.
//
// The result has the same shape as the body of POST /organizations/:id/website/discovery
// (CHUD-30, see parseDiscovery in ../website.ts):
//   high: saved as the entity's website
//   low:  top 3 candidates kept for review (CHUD-50)
//   none: there was nothing usable to rank
//
// Everything here is a plain function with no database or network access, so it can be
// unit-tested (test/rank.test.ts).

import type { SearchResults } from "../search/provider.ts";

export type SearchResult = SearchResults[number];

/** What we know about the entity whose website we are looking for. */
export type RankContext = {
  name: string;
  county?: string;
  city?: string;
};

export type ScoredCandidate = { url: string; page_title: string; score: number };

export type RankResult =
  | { confidence: "high"; url: string }
  | { confidence: "low"; candidates: ScoredCandidate[] }
  | { confidence: "none" };

// ---------- scoring weights ----------

const TITLE_FULL_NAME = 30; // the whole entity name appears in the title
const TITLE_NAME_WORDS = 20; // scaled by the share of name words found in the title
const DOMAIN_FULL_NAME = 30; // the domain spells out the name, or its acronym
const DOMAIN_NAME_WORDS = 15; // scaled by the share of name words found in the domain
const TLD_SCORES: Array<[suffix: string, score: number]> = [
  [".ca.gov", 25],
  [".gov", 25],
  [".us", 15],
  [".org", 10],
];
const COUNTY_MATCH = 10; // the entity's own county or city is named
const PLACE_KEYWORD = 5; // "county", "district", "city of", ...
const NON_OFFICIAL_MAX = 5; // known non-official sites never score above this

// ---------- confidence thresholds ----------

/** Lowest score that can be saved without review. */
export const HIGH_SCORE = 60;
/** How far the best site must be ahead of the best different site to be saved without review. */
export const MIN_LEAD = 10;
export const MAX_REVIEW_CANDIDATES = 3;

// Limits from the website_candidate table (CANDIDATE_FIELDS in ../website.ts).
const MAX_URL_LENGTH = 400;
const MAX_TITLE_LENGTH = 300;
const MAX_SCORE = 999.99;

/** Sites that are about an entity but are never its official website. Subdomains match too. */
const NON_OFFICIAL_DOMAINS = [
  // encyclopedias and directories
  "wikipedia.org", "wikimedia.org", "ballotpedia.org", "yelp.com", "yellowpages.com", "bbb.org",
  "mapquest.com", "manta.com", "zoominfo.com", "opencorporates.com", "bizapedia.com", "city-data.com",
  "niche.com", "greatschools.org", "usa.com", "countyoffice.org", "govsalaries.com", "transparentcalifornia.com",
  "indeed.com", "glassdoor.com", "google.com", "bing.com", "tripadvisor.com",
  // social media
  "facebook.com", "instagram.com", "twitter.com", "x.com", "linkedin.com", "youtube.com", "tiktok.com",
  "nextdoor.com", "reddit.com", "pinterest.com",
  // news
  "latimes.com", "nytimes.com", "sfgate.com", "sfchronicle.com", "mercurynews.com", "sacbee.com",
  "patch.com", "apnews.com", "reuters.com", "cnn.com", "foxnews.com", "nbcnews.com", "abc7.com",
  "kcra.com", "calmatters.org", "usatoday.com", "washingtonpost.com",
];

/** Words that say nothing about which entity a page belongs to. */
const STOP_WORDS = new Set(["the", "of", "and", "for", "a", "an", "in", "at", "on", "to"]);

const PLACE_KEYWORDS = ["county", "district", "city of", "town of", "township", "municipal"];

// ---------- helpers ----------

/** Lower case, "&" as "and", and every run of other punctuation as one space. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function nameWords(name: string): string[] {
  return normalize(name).split(" ").filter((word) => word && !STOP_WORDS.has(word));
}

function parseHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

export function isNonOfficial(url: string): boolean {
  const host = parseHost(url);
  return host !== null && NON_OFFICIAL_DOMAINS.some((domain) => hostMatches(host, domain));
}

/**
 * The labels of a host without its suffix: "lausd.net" -> ["lausd"], "dmv.ca.gov" -> ["dmv"],
 * "ci.salinas.ca.us" -> ["ci", "salinas"]. A two-letter state before .gov or .us is part of the suffix.
 */
function hostLabels(host: string): string[] {
  const parts = host.split(".");
  let suffix = 1;
  if (parts.length > 2 && ["gov", "us"].includes(parts.at(-1)!) && parts.at(-2)!.length === 2) suffix = 2;
  return parts.slice(0, parts.length - suffix);
}

function share(words: string[], isFound: (word: string) => boolean): number {
  return words.length === 0 ? 0 : words.filter(isFound).length / words.length;
}

// ---------- scoring ----------

/** Score one search result for the entity. Higher is more likely to be the official website. */
export function scoreCandidate(result: SearchResult, ctx: RankContext): number {
  const host = parseHost(result.url);
  if (!host) return 0;

  const words = nameWords(ctx.name);
  const title = ` ${normalize(result.title)} `;
  let score = 0;

  // Entity name in the title.
  if (words.length > 0 && title.includes(` ${words.join(" ")} `)) {
    score += TITLE_FULL_NAME;
  } else {
    score += TITLE_NAME_WORDS * share(words, (word) => title.includes(` ${word} `));
  }

  // Entity name in the domain: every word in any order ("County of San Mateo" -> "sanmateocounty"),
  // as an acronym ("lausd"), or else partly, word by word.
  const labels = hostLabels(host);
  const domain = labels.join("").replace(/-/g, "");
  const acronym = words.map((word) => word[0]).join("");
  const domainShare = share(words.filter((word) => word.length >= 3), (word) => domain.includes(word));
  if (domainShare === 1 || (acronym.length >= 3 && labels.includes(acronym))) {
    score += DOMAIN_FULL_NAME;
  } else {
    score += DOMAIN_NAME_WORDS * domainShare;
  }

  // Official-looking domain (first matching suffix only, so .ca.gov is not counted twice).
  const tld = TLD_SCORES.find(([suffix]) => host.endsWith(suffix));
  if (tld) score += tld[1];

  // County or district keywords.
  const places = [ctx.county, ctx.city].filter((place): place is string => !!place).map(normalize);
  if (places.some((place) => title.includes(` ${place} `) || domain.includes(place.replace(/ /g, "")))) {
    score += COUNTY_MATCH;
  }
  if (PLACE_KEYWORDS.some((keyword) => title.includes(` ${keyword} `))) score += PLACE_KEYWORD;

  if (isNonOfficial(result.url)) score = Math.min(score, NON_OFFICIAL_MAX);

  return Math.round(Math.min(Math.max(score, 0), MAX_SCORE) * 100) / 100;
}

// ---------- choosing ----------

/**
 * Score every result and decide what to send to CHUD-30.
 * High confidence needs a score of at least HIGH_SCORE, a lead of at least MIN_LEAD over the best
 * result on a different site, and a site that is not a known non-official one.
 * Anything else with at least one usable result is low confidence, with the top 3 for review.
 */
export function rankResults(results: SearchResults, ctx: RankContext): RankResult {
  // Keep usable URLs only, once each (the review table rejects duplicates).
  const byUrl = new Map<string, ScoredCandidate & { host: string }>();
  for (const result of results) {
    const host = parseHost(result.url);
    if (!host || result.url.length > MAX_URL_LENGTH) continue;
    const candidate = {
      url: result.url,
      page_title: (result.title ?? "").slice(0, MAX_TITLE_LENGTH),
      score: scoreCandidate(result, ctx),
      host,
    };
    const seen = byUrl.get(result.url);
    if (!seen || candidate.score > seen.score) byUrl.set(result.url, candidate);
  }

  const ranked = [...byUrl.values()].sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return { confidence: "none" };

  const best = ranked[0];
  const runnerUp = ranked.find((candidate) => candidate.host !== best.host);
  const lead = best.score - (runnerUp?.score ?? 0);
  if (best.score >= HIGH_SCORE && lead >= MIN_LEAD && !isNonOfficial(best.url)) {
    return { confidence: "high", url: best.url };
  }

  return {
    confidence: "low",
    candidates: ranked
      .slice(0, MAX_REVIEW_CANDIDATES)
      .map(({ url, page_title, score }) => ({ url, page_title, score })),
  };
}
