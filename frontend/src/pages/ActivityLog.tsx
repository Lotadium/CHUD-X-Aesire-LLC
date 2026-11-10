// Activity log page (CHUD-38, charter 2.3 g.ii and g.iii): everything that happened to the records,
// newest first, with filters for action type and entity. AI use: written with help from Claude (Anthropic).
import { useEffect, useState } from "react";
import { ACTIONS, PAGE_SIZE, fetchActivity, recordLink } from "../lib/activityApi";
import type { Action, ActivityEntry, ActivityFilters } from "../lib/activityApi";
import { fetchRecords } from "../lib/recordsApi";
import { Button, Card, ErrorBanner, PageHeader } from "../components/ui";

const th = "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted";
const td = "px-4 py-3 align-top";
const select = "h-10 rounded-lg border border-line bg-white px-3 text-sm";

// Colors for the action pills
const actionStyle: Record<Action, string> = {
  CREATED: "bg-green-50 text-green-700",
  MANUAL_UPDATE: "bg-brand/15 text-brand-strong",
  FLAGGED: "bg-amber-50 text-amber-800",
  REFRESH_ATTEMPT: "bg-slate-100 text-slate-700",
  REFRESH_SUCCESS: "bg-green-50 text-green-700",
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function Who({ entry }: { entry: ActivityEntry }) {
  if (entry.actor_type === "REFRESH") {
    return (
      <span>
        Refresh
        {entry.actor_name && <span className="block text-xs text-muted">started by {entry.actor_name}</span>}
      </span>
    );
  }
  return <span>{entry.actor_name ?? "Unknown user"}</span>;
}

export default function ActivityLog() {
  const [filters, setFilters] = useState<ActivityFilters>({ action: "", organizationId: "" });
  const [entities, setEntities] = useState<{ id: number; name: string }[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");

  // Entity names for the filter. If this fails the page still works, just without the entity filter options.
  useEffect(() => {
    fetchRecords()
      .then(({ organizations }) => setEntities(organizations.map((o) => ({ id: o.organization_id, name: o.name }))))
      .catch(() => setEntities([]));
  }, []);

  function load() {
    setStatus("loading");
    fetchActivity(filters)
      .then((page) => {
        setEntries(page.data);
        setTotal(page.total);
        setStatus("ready");
      })
      .catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong while contacting the server.");
        setStatus("error");
      });
  }

  useEffect(load, [filters]);

  async function loadMore() {
    setLoadingMore(true);
    setMoreError("");
    try {
      const page = await fetchActivity(filters, entries.length);
      setEntries((e) => [...e, ...page.data]);
      setTotal(page.total);
    } catch (err) {
      setMoreError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoadingMore(false);
    }
  }

  const filtered = filters.action !== "" || filters.organizationId !== "";

  return (
    <div>
      <PageHeader
        crumbs={["Home", "Records", "Activity log"]}
        title="Activity log"
        subtitle="Every change to the records, newest first: who made it and when."
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Action
          <select
            className={select}
            value={filters.action}
            onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value as Action | "" }))}
          >
            <option value="">All actions</option>
            {Object.entries(ACTIONS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Entity
          <select
            className={select}
            value={filters.organizationId}
            onChange={(e) => setFilters((f) => ({ ...f, organizationId: e.target.value }))}
          >
            <option value="">All entities</option>
            {entities.map((o) => (
              <option key={o.id} value={String(o.id)}>{o.name}</option>
            ))}
          </select>
        </label>
        {filtered && (
          <Button type="button" variant="secondary" onClick={() => setFilters({ action: "", organizationId: "" })}>
            Clear filters
          </Button>
        )}
      </div>

      {status === "loading" && (
        <Card title="Loading activity…" subtitle="Getting the latest changes.">
          <div role="status" aria-label="Loading" className="h-2 w-40 animate-pulse rounded bg-line" />
        </Card>
      )}

      {status === "error" && (
        <div className="space-y-4">
          <ErrorBanner text={errorMessage} />
          <Button type="button" variant="secondary" onClick={load}>Try again</Button>
        </div>
      )}

      {status === "ready" && entries.length === 0 && (
        filtered ? (
          <Card title="No matching activity" subtitle="Nothing matches these filters yet.">
            <p className="text-sm text-muted">Try another action or entity, or clear the filters.</p>
          </Card>
        ) : (
          <Card title="No activity yet" subtitle="Changes to entities and contacts will show up here.">
            <p className="text-sm text-muted">Creating, editing, flagging or refreshing a record adds an entry.</p>
          </Card>
        )
      )}

      {status === "ready" && entries.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>When</th>
                  <th className={th}>Action</th>
                  <th className={th}>Record</th>
                  <th className={th}>Details</th>
                  <th className={th}>Who</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const link = recordLink(entry);
                  return (
                    <tr key={entry.activity_id} className="border-b border-line last:border-0">
                      <td className={`${td} whitespace-nowrap text-muted`}>{formatWhen(entry.occurred_at)}</td>
                      <td className={td}>
                        <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${actionStyle[entry.action]}`}>
                          {ACTIONS[entry.action] ?? entry.action}
                        </span>
                      </td>
                      <td className={`${td} font-semibold`}>
                        {link ? <a href={link.href} className="text-brand-strong underline">{link.label}</a> : "—"}
                      </td>
                      <td className={`${td} text-muted`}>{entry.detail ?? "—"}</td>
                      <td className={td}><Who entry={entry} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3 text-sm text-muted">
            Showing {entries.length} of {total}
            {entries.length < total && (
              <Button type="button" variant="secondary" disabled={loadingMore} onClick={loadMore}>
                {loadingMore ? "Loading…" : `Show ${Math.min(PAGE_SIZE, total - entries.length)} more`}
              </Button>
            )}
          </div>
          {moreError && <div className="mt-3"><ErrorBanner text={moreError} /></div>}
        </>
      )}
    </div>
  );
}
