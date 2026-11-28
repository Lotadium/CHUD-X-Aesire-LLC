// Refresh results screen (CHUD-56): what a refresh found, and the records staff need to fix by hand
// (Charter 2.3 c). Opened at #/refresh/<run id> from the Refresh page, or #/refresh/latest for the
// most recent run. AI use: written with help from Claude (Anthropic).
//
// Every count comes straight from the API's run summary (GET /api/refresh/:id), so the screen always
// matches what the backend recorded. "Open record" goes to the record page (CHUD-64), "Update by hand"
// to the organization edit form, and "Check again" re-runs the refresh for that one record after a fix.
import { useEffect, useMemo, useState } from "react";
import { Button, Card, ErrorBanner, PageHeader } from "../components/ui";
import { getRefreshRun, listRefreshRuns, nextRefreshBatch, startRefresh } from "../lib/refreshApi";
import type { RefreshRunResult, RefreshRunSummary, UnverifiedResult } from "../lib/refreshApi";

const RECENT_RUNS = 5;

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" } // #/refresh/latest with no refreshes yet
  | { status: "loaded"; run: RefreshRunResult };

// The outcome of "Check again" for one record
type Recheck = { status: "checking" } | { status: "verified" } | { status: "still"; detail: string } | { status: "error"; message: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong.");

export default function RefreshResultsPage({ runId }: { runId: string }) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [recent, setRecent] = useState<RefreshRunSummary[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchRun() {
      // The "Recent refreshes" list is extra: if it fails, the results still show
      const runsRequest = listRefreshRuns(RECENT_RUNS).catch(() => null);
      try {
        let id = runId;
        if (runId === "latest") {
          const runs = await runsRequest;
          if (runs === null) throw new Error("Couldn’t load the list of refreshes. Check that the API is running and try again.");
          id = runs[0]?.run_id ?? "";
        }
        runsRequest.then((runs) => { if (!cancelled) setRecent(runs); });
        if (!id) {
          setLoad({ status: "empty" });
          return;
        }
        const run = await getRefreshRun(id);
        if (!cancelled) setLoad({ status: "loaded", run });
      } catch (err) {
        if (!cancelled) setLoad({ status: "error", message: errorText(err) });
      }
    }
    fetchRun();
    return () => { cancelled = true; };
  }, [runId]);

  return (
    <div>
      <PageHeader
        crumbs={["Records", "Refresh", "Results"]}
        title="Refresh results"
        subtitle="What the refresh checked, and the records that need to be fixed by hand."
      />

      <div className="space-y-6">
        {load.status === "loading" && <p className="text-sm text-muted">Loading the refresh results…</p>}

        {load.status === "error" && (
          <Card title="Couldn’t load the results">
            <div className="space-y-4">
              <ErrorBanner text={load.message} />
              <a href="#/refresh" className="text-sm font-medium text-brand-strong underline-offset-2 hover:underline">
                Back to Refresh
              </a>
            </div>
          </Card>
        )}

        {load.status === "empty" && (
          <Card title="No refreshes yet" subtitle="Run a refresh to see its results here.">
            <a href="#/refresh" className="inline-flex h-10 items-center rounded-lg bg-brand px-5 text-sm font-semibold text-ink hover:bg-brand-hover">
              Go to Refresh
            </a>
          </Card>
        )}

        {load.status === "loaded" && (
          <>
            <RunCard run={load.run} />
            <UnverifiedCard run={load.run} />
          </>
        )}

        {recent && recent.length > 0 && (
          <RecentRuns runs={recent} current={load.status === "loaded" ? load.run.run_id : null} />
        )}
      </div>
    </div>
  );
}

// ---- The counts ----

function Stat({ label, value, tone }: { label: string; value: number; tone: "plain" | "good" | "info" | "warn" }) {
  const colors = {
    plain: "border-line bg-white",
    good: "border-green-200 bg-green-50",
    info: "border-sky-200 bg-sky-50",
    warn: "border-amber-200 bg-amber-50",
  }[tone];
  return (
    <div className={`rounded-lg border px-4 py-3 ${colors}`}>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-bold">{value}</dd>
    </div>
  );
}

function RunCard({ run }: { run: RefreshRunResult }) {
  const started = formatDate(run.created_at);
  const finished = formatDate(run.finished_at);
  const by = run.requested_by ? ` by ${run.requested_by}` : "";
  return (
    <Card
      title={`Refresh #${run.run_id}`}
      subtitle={`Started${started ? ` ${started}` : ""}${by}${run.done && finished ? ` · finished ${finished}` : ""}`}
      aside={
        <a href="#/refresh" className="inline-flex h-10 items-center rounded-lg border border-line bg-white px-5 text-sm font-semibold text-ink hover:bg-slate-50">
          Run another refresh
        </a>
      }
    >
      {!run.done && (
        <div role="status" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This refresh hasn’t finished: {run.processed} of {run.total} records were processed. The counts below are
          for those records. Go to Refresh to run it again.
        </div>
      )}
      <dl aria-label="Refresh counts" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Records checked" value={run.processed} tone="plain" />
        <Stat label="Verified" value={run.verified} tone="good" />
        <Stat label="Updated" value={run.updated} tone="info" />
        <Stat label="Couldn’t be verified" value={run.unverified_count} tone="warn" />
      </dl>
      <p className="mt-3 text-xs text-muted">
        Updated: records where the refresh saved new details, a new website or new contact details. A record can be
        updated and still need attention.
      </p>
    </Card>
  );
}

// ---- The records that couldn't be verified ----

function UnverifiedCard({ run }: { run: RefreshRunResult }) {
  const [reasonFilter, setReasonFilter] = useState("");
  const [rechecks, setRechecks] = useState<Record<number, Recheck>>({});

  // The reasons in this run, most common first, for the filter
  const reasons = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const r of run.unverified) {
      const entry = counts.get(r.reason_code) ?? { label: r.reason, count: 0 };
      entry.count += 1;
      counts.set(r.reason_code, entry);
    }
    return [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [run.unverified]);

  const shown = reasonFilter ? run.unverified.filter((r) => r.reason_code === reasonFilter) : run.unverified;
  const remaining = run.unverified.filter((r) => rechecks[r.organization_id]?.status !== "verified").length;

  async function checkAgain(record: UnverifiedResult) {
    const id = record.organization_id;
    if (rechecks[id]?.status === "checking") return;
    setRechecks((prev) => ({ ...prev, [id]: { status: "checking" } }));
    try {
      let progress = await startRefresh([id]);
      while (!progress.done) progress = await nextRefreshBatch(progress.run_id);
      const problem = progress.unverified.find((u) => u.organization_id === id);
      const result: Recheck = problem ? { status: "still", detail: problem.detail || problem.reason } : { status: "verified" };
      setRechecks((prev) => ({ ...prev, [id]: result }));
    } catch (err) {
      setRechecks((prev) => ({ ...prev, [id]: { status: "error", message: errorText(err) } }));
    }
  }

  if (run.unverified.length === 0) {
    return (
      <Card title="Every record was verified" subtitle="Nothing needs to be fixed by hand from this refresh.">
        <p className="text-sm text-muted">Flagged records are never refreshed, so they don’t appear here.</p>
      </Card>
    );
  }

  return (
    <Card
      title={`${plural(remaining, "record needs", "records need")} attention`}
      subtitle="Open a record to see its details, or update it by hand. After fixing it, check it again."
      aside={
        reasons.length > 1 ? (
          <label className="text-sm font-medium">
            <span className="mr-2">Reason</span>
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              className="h-9 rounded-lg border border-line bg-white px-2 text-sm font-normal"
            >
              <option value="">All reasons ({run.unverified.length})</option>
              {reasons.map(([code, { label, count }]) => (
                <option key={code} value={code}>
                  {label} ({count})
                </option>
              ))}
            </select>
          </label>
        ) : undefined
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Records the refresh couldn’t verify, with the reason for each</caption>
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="py-2 pr-4 font-semibold">Record</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Reason</th>
              <th scope="col" className="py-2 font-semibold"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <UnverifiedRow key={r.organization_id} record={r} recheck={rechecks[r.organization_id]} onCheckAgain={() => checkAgain(r)} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function UnverifiedRow({ record, recheck, onCheckAgain }: { record: UnverifiedResult; recheck?: Recheck; onCheckAgain: () => void }) {
  const verified = recheck?.status === "verified";
  const link = "font-medium text-brand-strong underline-offset-2 hover:underline";
  return (
    <tr className={`border-b border-line align-top last:border-0 ${verified ? "bg-green-50/60" : ""}`}>
      <td className="py-3 pr-4">
        <div className="font-medium">{record.name}</div>
        {record.changed && <div className="mt-0.5 text-xs text-muted">Some new details were still saved</div>}
      </td>
      <td className="py-3 pr-4">
        {verified ? (
          <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">Verified now</span>
        ) : (
          <>
            <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">{record.reason}</span>
            <div className="mt-1 text-xs text-muted">{recheck?.status === "still" ? `Still not verified: ${recheck.detail}` : record.detail}</div>
          </>
        )}
        {recheck?.status === "error" && <div className="mt-1 text-xs text-red-700" role="alert">{recheck.message}</div>}
      </td>
      <td className="py-3">
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 whitespace-nowrap">
          <a href={`#/records/${record.organization_id}`} className={link} aria-label={`Open record: ${record.name}`}>
            Open record
          </a>
          <a href={`#/entity/${record.organization_id}`} className={link} aria-label={`Update by hand: ${record.name}`}>
            Update by hand
          </a>
          {!verified && (
            <Button
              type="button"
              variant="secondary"
              className="h-8 px-3 text-xs"
              onClick={onCheckAgain}
              disabled={recheck?.status === "checking"}
              aria-label={`Check again: ${record.name}`}
            >
              {recheck?.status === "checking" ? "Checking…" : "Check again"}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---- Earlier runs ----

function RecentRuns({ runs, current }: { runs: RefreshRunSummary[]; current: string | null }) {
  return (
    <Card title="Recent refreshes" subtitle="Open an earlier refresh to see its results.">
      <ul className="divide-y divide-line text-sm">
        {runs.map((r) => {
          const isCurrent = r.run_id === current;
          return (
            <li key={r.run_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div>
                <span className="font-medium">Refresh #{r.run_id}</span>
                <span className="text-muted">
                  {" · "}
                  {formatDate(r.created_at)}
                  {r.requested_by ? ` · ${r.requested_by}` : ""}
                </span>
                <div className="text-xs text-muted">
                  {r.done ? "" : `Not finished (${r.processed} of ${r.total}) · `}
                  {r.verified} verified · {r.updated} updated · {r.unverified_count} couldn’t be verified
                </div>
              </div>
              {isCurrent ? (
                <span className="text-xs font-medium text-muted" aria-current="page">Showing</span>
              ) : (
                <a href={`#/refresh/${r.run_id}`} className="font-medium text-brand-strong underline-offset-2 hover:underline">
                  View results
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
