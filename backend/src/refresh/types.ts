// AI use: written with AI help from Claude Code (Sonnet 5.5), directed by Irene Riva. See "AI use" in backend/README.md.
import type { RankResult } from "../ranking/rank.ts";

/** The two outside services a refresh needs. They are passed in so tests can replace them. */
export type RefreshDeps = {
  /** Search the web for the entity's website and rank the results (CHUD-29, CHUD-48). */
  findWebsite(org: OrganizationInfo): Promise<RankResult>;
  /** Look up one contact we already know on the entity's website (CHUD-34). Must not throw for "not found". */
  lookupContact(websiteUrl: string, name: ContactName): Promise<LookupResult>;
  /** Written to web_search_log for every search, e.g. "brave". */
  searchProvider: string;
};

export type OrganizationInfo = { organization_id: number; name: string; domain_name: string };

export type ContactName = { firstName: string; middleName?: string; lastName: string; nameSuffix?: string };

/** What the website says about one contact. A field the page did not show is null. */
export type ContactDetails = { title: string | null; email: string | null; phone: string | null };

export type LookupResult =
  | { found: true; details: ContactDetails; sourceUrl: string }
  | { found: false; code: LookupFailureCode; reason: string };

export type LookupFailureCode = "SITE_UNREACHABLE" | "CONTACT_NOT_LISTED" | "LOOKUP_UNAVAILABLE";

/** Short codes for why a record could not be verified. The words go in `reason`. */
export type ReasonCode =
  | LookupFailureCode
  | "NO_WEBSITE_FOUND"
  | "WEBSITE_NEEDS_REVIEW"
  | "SEARCH_LIMIT_REACHED"
  | "SEARCH_FAILED"
  | "NO_CONTACT_DATA"
  | "EMAIL_BELONGS_TO_OTHER_CONTACT"
  | "RECORD_UNAVAILABLE"
  | "ERROR";
