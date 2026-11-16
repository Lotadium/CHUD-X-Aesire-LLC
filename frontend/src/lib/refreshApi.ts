// Refresh runs for the Refresh page (CHUD-33). AI use: written with help from Claude (Anthropic).
//
// Talks to Irene's refresh endpoint (CHUD-35, "Data refresh" in backend/README.md). Cloudflare Workers
// can't run one long request for every record, so the page drives the run a few records at a time:
//
//   POST /api/refresh                { all: true } or { organization_ids }   starts a run (no work yet)
//   POST /api/refresh/:id/process                                            does the next few records
//
// Both return the same run summary. The page keeps calling "process" until status is COMPLETE, which
// is why it asks the user to keep it open. "process" is safe to call again after a failure: records
// already done are not redone, so "Continue refresh" just calls it again.
//
//   Fake (default):  nothing to set up, simulates a 50-record run with a few failures
//   Real:            VITE_USE_REAL_API=true in .env.local (same switch as src/lib/api.ts)

export type UnverifiedRecord = {
  organization_id: number;
  name: string;
  reason: string; // short, for the pop-up: "website not found"
  detail: string; // the backend's full reason: "Sam Lee: Requested contact was not found on the crawled pages"
  reason_code: string; // e.g. "NO_WEBSITE_FOUND" (list in backend/src/refresh/types.ts)
};

// What the page works with
export type RefreshProgress = {
  run_id: string;
  total: number; // records in this run
  processed: number; // records finished so far, verified or not
  verified: number;
  updated: number; // records where the refresh saved a change
  unverified: UnverifiedRecord[]; // everything that couldn't be verified so far
  done: boolean;
};

// What the backend sends (RunSummary in backend/src/refresh/run.ts)
type ApiRunSummary = {
  run_id: number;
  status: "RUNNING" | "COMPLETE";
  total: number;
  processed: number;
  percent_complete: number;
  verified: number;
  unverified: number;
  updated: number;
  unverified_records: { organization_id: number; name: string; reason_code: string; reason: string; changed: boolean }[];
};

// Short reasons for the pop-up, in the style of the mockup ("Hartley Water District — website not found")
const SHORT_REASONS: Record<string, string> = {
  NO_WEBSITE_FOUND: "website not found",
  WEBSITE_NEEDS_REVIEW: "website needs review",
  SEARCH_FAILED: "website search failed",
  SEARCH_LIMIT_REACHED: "monthly search limit reached",
  SITE_UNREACHABLE: "site unreachable",
  CONTACT_NOT_LISTED: "contact not found",
  NO_CONTACT_DATA: "no contact details listed",
  EMAIL_BELONGS_TO_OTHER_CONTACT: "email belongs to another contact",
  LOOKUP_UNAVAILABLE: "contact lookup unavailable",
  RECORD_UNAVAILABLE: "record was flagged",
  ERROR: "unexpected error",
};

export function toProgress(s: ApiRunSummary): RefreshProgress {
  return {
    run_id: String(s.run_id),
    total: s.total,
    processed: s.processed,
    verified: s.verified,
    updated: s.updated,
    unverified: s.unverified_records.map((r) => ({
      organization_id: r.organization_id,
      name: r.name,
      reason: SHORT_REASONS[r.reason_code] ?? "couldn’t be verified",
      detail: r.reason,
      reason_code: r.reason_code,
    })),
    done: s.status === "COMPLETE",
  };
}

const BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8787/api";
// Who started the refresh (saved as updated_by in the record history). Same default as realApi.ts.
const USER: string = import.meta.env.VITE_API_USER ?? "frontend";

async function post<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-User": USER },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach the server. Check that the API is running and try again.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? `Request failed (${res.status}).`);
  return data as T;
}

const realRefresh = {
  start: async (organizationIds?: number[]) =>
    toProgress(await post<ApiRunSummary>("/refresh", organizationIds ? { organization_ids: organizationIds } : { all: true })),
  next: async (runId: string) => toProgress(await post<ApiRunSummary>(`/refresh/${encodeURIComponent(runId)}/process`)),
};

// ---- Fake run: same summaries as the backend, for working without the API ----

const FAKE_TOTAL = 50;
const FAKE_BATCH = 3; // the backend's default batch size
const FAKE_DELAY_MS = 300;
const FAKE_FAILURES: Record<number, [string, string, string]> = {
  3: ["Hartley Water District", "NO_WEBSITE_FOUND", "No website was found for this record"],
  9: ["Valley Mosquito Abatement", "WEBSITE_NEEDS_REVIEW", "A website was found, but not with enough confidence; a person needs to pick the right one"],
  14: ["Station 12 (General Line)", "NO_CONTACT_DATA", "Station 12: The page lists the contact with no name"],
  22: ["Delta Resource Conservation", "SITE_UNREACHABLE", "The website could not be reached"],
  31: ["Rio Linda Fire", "CONTACT_NOT_LISTED", "Sam Lee: Requested contact was not found on the crawled pages"],
  40: ["Sutter Cemetery District", "SITE_UNREACHABLE", "The website could not be reached"],
  47: ["Oak Park Recreation", "NO_WEBSITE_FOUND", "No website was found for this record"],
};

const fakeRuns = new Map<number, ApiRunSummary>();
let nextFakeId = 1;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fakeRefresh = {
  async start(organizationIds?: number[]): Promise<RefreshProgress> {
    await sleep(FAKE_DELAY_MS);
    const total = organizationIds?.length ?? FAKE_TOTAL;
    const run: ApiRunSummary = {
      run_id: nextFakeId++, status: total === 0 ? "COMPLETE" : "RUNNING", total, processed: 0, percent_complete: 0,
      verified: 0, unverified: 0, updated: 0, unverified_records: [],
    };
    fakeRuns.set(run.run_id, run);
    return toProgress(structuredClone(run));
  },
  async next(runId: string): Promise<RefreshProgress> {
    await sleep(FAKE_DELAY_MS);
    const run = fakeRuns.get(Number(runId));
    if (!run) throw new Error("Refresh run not found");
    const end = Math.min(run.processed + FAKE_BATCH, run.total);
    for (let id = run.processed + 1; id <= end; id++) {
      const failure = FAKE_FAILURES[id];
      if (failure) {
        run.unverified += 1;
        run.unverified_records.push({ organization_id: id, name: failure[0], reason_code: failure[1], reason: failure[2], changed: false });
      } else {
        run.verified += 1;
        if (id % 4 === 0) run.updated += 1;
      }
    }
    run.processed = end;
    run.percent_complete = Math.round((end * 100) / run.total);
    run.status = end === run.total ? "COMPLETE" : "RUNNING";
    return toProgress(structuredClone(run));
  },
};

const useReal = import.meta.env.VITE_USE_REAL_API === "true";
const refresh = useReal ? realRefresh : fakeRefresh;

export const startRefresh = refresh.start;
export const nextRefreshBatch = refresh.next;
