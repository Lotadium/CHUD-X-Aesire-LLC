// Refresh runs for the Refresh page (CHUD-33) and the refresh results screen (CHUD-56).
// AI use: written with help from Claude (Anthropic).
//
// Talks to Irene's refresh endpoint (CHUD-35, "Data refresh" in backend/README.md). Cloudflare Workers
// can't run one long request for every record, so the page drives the run a few records at a time:
//
//   POST /api/refresh                { all: true } or { organization_ids }   starts a run (no work yet)
//   POST /api/refresh/:id/process                                            does the next few records
//   GET  /api/refresh/:id                                                    a run's summary, no work (CHUD-56)
//   GET  /api/refresh?limit=N                                                past runs, newest first (CHUD-56)
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
type ApiUnverified = { organization_id: number; name: string; reason_code: string | null; reason: string | null; changed: boolean };
type ApiRunSummary = {
  run_id: number;
  requested_by?: string | null;
  created_at?: string;
  finished_at?: string | null;
  status: "RUNNING" | "COMPLETE";
  total: number;
  processed: number;
  percent_complete: number;
  verified: number;
  unverified: number;
  updated: number;
  unverified_records: ApiUnverified[];
};
type ApiRunListItem = Omit<ApiRunSummary, "unverified_records">;

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

function toUnverified(r: ApiUnverified): UnverifiedRecord {
  const code = r.reason_code ?? "";
  const short = SHORT_REASONS[code] ?? "couldn’t be verified";
  return { organization_id: r.organization_id, name: r.name, reason: short, detail: r.reason ?? short, reason_code: code };
}

export function toProgress(s: ApiRunSummary): RefreshProgress {
  return {
    run_id: String(s.run_id),
    total: s.total,
    processed: s.processed,
    verified: s.verified,
    updated: s.updated,
    unverified: s.unverified_records.map(toUnverified),
    done: s.status === "COMPLETE",
  };
}

// ---- Results of a run, for the refresh results screen (CHUD-56) ----

// One record the run couldn't verify. `changed`: some details were still saved for it.
export type UnverifiedResult = UnverifiedRecord & { changed: boolean };

// A past run without its records, for the "Recent refreshes" list
export type RefreshRunSummary = {
  run_id: string;
  requested_by: string | null;
  created_at: string;
  finished_at: string | null;
  done: boolean;
  total: number;
  processed: number;
  verified: number;
  updated: number;
  unverified_count: number; // the API's count, shown as is so the screen matches the API
};

export type RefreshRunResult = RefreshRunSummary & { unverified: UnverifiedResult[] };

function toRunSummary(s: ApiRunListItem): RefreshRunSummary {
  return {
    run_id: String(s.run_id),
    requested_by: s.requested_by ?? null,
    created_at: s.created_at ?? "",
    finished_at: s.finished_at ?? null,
    done: s.status === "COMPLETE",
    total: s.total,
    processed: s.processed,
    verified: s.verified,
    updated: s.updated,
    unverified_count: s.unverified,
  };
}

export function toRunResult(s: ApiRunSummary): RefreshRunResult {
  return { ...toRunSummary(s), unverified: s.unverified_records.map((r) => ({ ...toUnverified(r), changed: r.changed })) };
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

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE_URL + path);
  } catch {
    throw new Error("Can't reach the server. Check that the API is running and try again.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? `Request failed (${res.status}).`);
  return data as T;
}

const realRefresh = {
  get: async (runId: string) => toRunResult(await get<ApiRunSummary>(`/refresh/${encodeURIComponent(runId)}`)),
  list: async (limit: number) =>
    (await get<{ data: ApiRunListItem[] }>(`/refresh?limit=${limit}`)).data.map(toRunSummary),
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

function newFakeRun(total: number): ApiRunSummary {
  const run: ApiRunSummary = {
    run_id: nextFakeId++, requested_by: USER, created_at: new Date().toISOString(), finished_at: null,
    status: total === 0 ? "COMPLETE" : "RUNNING", total, processed: 0, percent_complete: 0,
    verified: 0, unverified: 0, updated: 0, unverified_records: [],
  };
  if (total === 0) run.finished_at = run.created_at;
  fakeRuns.set(run.run_id, run);
  return run;
}

function advanceFakeRun(run: ApiRunSummary, count: number) {
  const end = Math.min(run.processed + count, run.total);
  for (let id = run.processed + 1; id <= end; id++) {
    const failure = FAKE_FAILURES[id];
    if (failure) {
      run.unverified += 1;
      // Delta Resource Conservation: a new phone number was still saved, to show "some details saved"
      run.unverified_records.push({ organization_id: id, name: failure[0], reason_code: failure[1], reason: failure[2], changed: id === 22 });
      if (id === 22) run.updated += 1;
    } else {
      run.verified += 1;
      if (id % 4 === 0) run.updated += 1;
    }
  }
  run.processed = end;
  run.percent_complete = run.total === 0 ? 0 : Math.round((end * 100) / run.total);
  run.status = end === run.total ? "COMPLETE" : "RUNNING";
  if (run.status === "COMPLETE") run.finished_at = new Date().toISOString();
}

// So the results screen has something to show on the fake data before anyone has run a refresh
function ensureFakeHistory() {
  if (fakeRuns.size > 0) return;
  const run = newFakeRun(FAKE_TOTAL);
  advanceFakeRun(run, FAKE_TOTAL);
}

const fakeRefresh = {
  async get(runId: string): Promise<RefreshRunResult> {
    await sleep(FAKE_DELAY_MS);
    ensureFakeHistory();
    const run = fakeRuns.get(Number(runId));
    if (!run) throw new Error("Refresh run not found");
    return toRunResult(structuredClone(run));
  },
  async list(limit: number): Promise<RefreshRunSummary[]> {
    await sleep(FAKE_DELAY_MS);
    ensureFakeHistory();
    return [...fakeRuns.values()].reverse().slice(0, limit).map(toRunSummary);
  },
  async start(organizationIds?: number[]): Promise<RefreshProgress> {
    await sleep(FAKE_DELAY_MS);
    const run = newFakeRun(organizationIds?.length ?? FAKE_TOTAL);
    return toProgress(structuredClone(run));
  },
  async next(runId: string): Promise<RefreshProgress> {
    await sleep(FAKE_DELAY_MS);
    const run = fakeRuns.get(Number(runId));
    if (!run) throw new Error("Refresh run not found");
    advanceFakeRun(run, FAKE_BATCH);
    return toProgress(structuredClone(run));
  },
};

const useReal = import.meta.env.VITE_USE_REAL_API === "true";
const refresh = useReal ? realRefresh : fakeRefresh;

export const startRefresh = refresh.start;
export const nextRefreshBatch = refresh.next;
export const getRefreshRun = refresh.get;
export const listRefreshRuns = refresh.list;
