// AI use: written with AI help from Claude Code (Sonnet 5.5), directed by Irene Riva. See "AI use" in backend/README.md.
import { one, updateRow, type Actor, type Queryable } from "./db.ts";
import { HttpError, type FieldErrors } from "./errors.ts";
import { notFound } from "./http.ts";
import { collectFields, failIfInvalid, type Parsed, type Schema } from "./validate.ts";

/**
 * Rules for changing an entity's website URL (CHUD-30). Used by both the website
 * endpoint and the general organization edit, so they can never disagree.
 *
 * - A URL that is already set is never replaced (or cleared) unless the caller confirms.
 * - A change is recorded as a manual one: source MANUAL, status FOUND, and the time it changed.
 *   Clearing the URL puts the entity back to NOT_SEARCHED.
 * - Any candidate URLs waiting for review are dropped, because a person has now decided.
 * - The old URL stays available in record_history (the history trigger copies every update).
 *
 * `fields` is the update about to be saved. This adds the bookkeeping columns to it,
 * or removes `website_url` if it would not change anything.
 */
export async function applyWebsiteChange(
  db: Queryable,
  organizationId: number,
  fields: Parsed,
  confirmOverwrite: boolean,
): Promise<void> {
  // Lock the row so two people changing the URL at once cannot both pass the check.
  const current = await one<{ website_url: string | null }>(
    db,
    "SELECT website_url FROM organization WHERE organization_id = $1 FOR UPDATE",
    [organizationId],
  );
  if (!current) throw notFound("Organization");

  const existing = current.website_url;
  const next = fields.website_url as string | null;

  if (next === existing) {
    delete fields.website_url; // nothing to change
    return;
  }

  if (existing && !confirmOverwrite) {
    throw new HttpError(
      409,
      `This entity already has a website (${existing}). Send confirm_overwrite: true to replace it.`,
      { website_url: "already set" },
    );
  }

  fields.website_status = next ? "FOUND" : "NOT_SEARCHED";
  fields.website_source = next ? "MANUAL" : null;
  fields.website_updated_at = new Date().toISOString();

  await db.query("DELETE FROM website_candidate WHERE organization_id = $1", [organizationId]);
}

// ---------- automatic discovery (result of the web search + ranking) ----------

const DISCOVERY_FIELDS: Schema = {
  confidence: { type: "string", max: 10, required: true },
  url: { type: "string", max: 400, format: "url" },
  confirm_overwrite: { type: "bool" },
};

const CANDIDATE_FIELDS: Schema = {
  url: { type: "string", max: 400, format: "url", required: true },
  page_title: { type: "string", max: 300 },
  score: { type: "number", min: 0, max: 999.99 },
};

const MAX_CANDIDATES = 3;

export type Discovery = {
  confidence: "high" | "low" | "none";
  url: string | null;
  candidates: Parsed[];
  confirmOverwrite: boolean;
};

/**
 * Check what the ranking step sends us:
 *   high: { confidence: "high", url }                      save the URL
 *   low:  { confidence: "low", candidates: [1 to 3] }      keep the candidates for review
 *   none: { confidence: "none" }                           nothing was found
 */
export function parseDiscovery(body: unknown): Discovery {
  const errors: FieldErrors = {};
  const top = collectFields(body, DISCOVERY_FIELDS, "create", errors);
  const raw = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;

  const confidence = typeof top.confidence === "string" ? top.confidence.toLowerCase() : undefined;
  if (confidence !== undefined && !["high", "low", "none"].includes(confidence)) {
    errors.confidence = "must be high, low or none";
  }

  let candidates: Parsed[] = [];
  if (raw.candidates !== undefined && raw.candidates !== null) {
    if (!Array.isArray(raw.candidates)) {
      errors.candidates = "must be a list";
    } else if (raw.candidates.length > MAX_CANDIDATES) {
      errors.candidates = `must have at most ${MAX_CANDIDATES} items`;
    } else {
      candidates = raw.candidates.map((item, i) =>
        collectFields(item, CANDIDATE_FIELDS, "create", errors, `candidates[${i}].`),
      );
      const seen = new Set<unknown>();
      candidates.forEach((candidate, i) => {
        if (candidate.url && seen.has(candidate.url)) errors[`candidates[${i}].url`] = "is listed twice";
        seen.add(candidate.url);
      });
    }
  }

  if (confidence === "high" && !top.url) errors.url = "is required when confidence is high";
  if (confidence === "low" && candidates.length === 0 && !errors.candidates) {
    errors.candidates = "needs at least one candidate when confidence is low";
  }

  failIfInvalid(errors);
  return {
    confidence: confidence as Discovery["confidence"],
    url: (top.url as string | null) ?? null,
    candidates,
    confirmOverwrite: top.confirm_overwrite === true,
  };
}

export type DiscoveryResult = "saved" | "needs_review" | "no_match" | "unchanged";

/**
 * Save a discovery result. These changes are recorded as automatic (REFRESH), not as a person's edit.
 * Like a manual change, they never replace a URL that is already set unless the caller confirms.
 */
export async function saveDiscoveryResult(
  db: Queryable,
  actor: Actor,
  organizationId: number,
  input: Discovery,
): Promise<DiscoveryResult> {
  const current = await one<{ website_url: string | null }>(
    db,
    "SELECT website_url FROM organization WHERE organization_id = $1 FOR UPDATE",
    [organizationId],
  );
  if (!current) throw notFound("Organization");
  const existing = current.website_url;

  // Finding the URL we already have changes nothing.
  if (input.confidence === "high" && input.url === existing) return "unchanged";

  if (existing && !input.confirmOverwrite) {
    throw new HttpError(
      409,
      `This entity already has a website (${existing}). Send confirm_overwrite: true to run discovery anyway.`,
      { website_url: "already set" },
    );
  }

  const now = new Date().toISOString();
  let fields: Parsed;
  let result: DiscoveryResult;
  if (input.confidence === "high") {
    fields = { website_url: input.url, website_status: "FOUND", website_source: "AUTO", website_updated_at: now };
    result = "saved";
  } else if (input.confidence === "low") {
    // The URL (if any) is left alone; a person picks from the candidates.
    fields = { website_status: "NEEDS_REVIEW" };
    result = "needs_review";
  } else {
    fields = { website_status: "NOT_FOUND" };
    result = "no_match";
  }
  await updateRow(db, "organization", "organization_id", organizationId, fields, actor, "REFRESH");

  // The candidate list always reflects the latest search.
  await db.query("DELETE FROM website_candidate WHERE organization_id = $1", [organizationId]);
  if (input.confidence === "low") {
    for (const [i, candidate] of input.candidates.entries()) {
      await db.query(
        "INSERT INTO website_candidate (organization_id, url, page_title, score, rank) VALUES ($1, $2, $3, $4, $5)",
        [organizationId, candidate.url, candidate.page_title, candidate.score, i + 1],
      );
    }
  }
  return result;
}
