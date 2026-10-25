import { useEffect, useRef, useState } from "react";
import { fetchRecords } from "../lib/recordsApi";
import type { Organization, Person } from "../lib/recordsApi";
import { fetchSearchUsage, findWebsite, reviewScreenUrl } from "../lib/websiteSearchApi";
import type { SearchResult, SearchUsage } from "../lib/websiteSearchApi";
import { Button, Card, ErrorBanner, FlagIcon, PageHeader } from "../components/ui";
 
type Row = {
  key: string; orgId: number; firstOfEntity: boolean;
  domain: string; entity: string; website: string; flagged: boolean;
  noContact: boolean; contact: string; title: string; email: string; phone: string; updated: string;
};
 
function formatDate(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
}
 
// One row per contact. An entity with no contacts still gets one row.
function buildRows(orgs: Organization[], people: Person[]): Row[] {
  const rows: Row[] = [];
  for (const org of orgs) {
    const base = {
      orgId: org.organization_id,
      domain: org.domain_name ?? "—",
      entity: org.name,
      website: org.website_url ?? "—",
      flagged: org.is_flagged === true,
      updated: formatDate(org.date_last_updated),
    };
    const contacts = people.filter((p) =>
      p.positions.some((pos) => pos.organization_id === org.organization_id),
    );
    if (contacts.length === 0) {
      rows.push({ key: `org-${org.organization_id}`, ...base, firstOfEntity: true, noContact: true, contact: "No contacts yet", title: "—", email: "—", phone: "—" });
      continue;
    }
    contacts.forEach((person, i) => {
      const pos = person.positions.find((x) => x.organization_id === org.organization_id)!;
      rows.push({
        key: `${org.organization_id}-${person.person_id}`, ...base, firstOfEntity: i === 0, noContact: false,
        contact: `${person.first_name} ${person.last_name}`,
        title: pos.title ?? "—",
        email: person.emails.find((e) => !e.is_flagged)?.address ?? "—",
        phone: pos.phone ?? "—",
      });
    });
  }
  return rows;
}
 
// Website search state for one entity (CHUD-49). AI use: written with help from Claude.
type SearchState =
  | { status: "searching" }
  | { status: "done"; result: SearchResult; url: string | null }
  | { status: "error"; message: string };
 
// How many searches a bulk action runs at the same time
const BULK_CONCURRENCY = 3;
 
function SearchOutcome({ orgId, state }: { orgId: number; state: SearchState | undefined }) {
  if (!state) return null;
  if (state.status === "searching") {
    return (
      <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted">
        <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-brand-strong" />
        Searching…
      </span>
    );
  }
  if (state.status === "error") {
    return <span role="alert" className="text-xs text-red-700">Search failed: {state.message}</span>;
  }
  if (state.result === "saved") {
    return <span className="text-xs font-medium text-green-700">URL saved</span>;
  }
  if (state.result === "needs_review") {
    return (
      <a href={reviewScreenUrl(orgId)} className="text-xs font-medium text-amber-800 underline">
        Needs review
      </a>
    );
  }
  return <span className="text-xs text-muted">No match found</span>;
}
 
const th = "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted";
const td = "px-4 py-3 align-top";
 
export default function RecordsList() {
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [rows, setRows] = useState<Row[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [searches, setSearches] = useState<Record<number, SearchState>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [usage, setUsage] = useState<SearchUsage | null>(null);
  const [usageError, setUsageError] = useState(false);
  // Entities with a search in progress. A ref (not state) so two fast clicks can't both start a search.
  const running = useRef<Set<number>>(new Set());
 
  function loadUsage() {
    fetchSearchUsage()
      .then((u) => { setUsage({ used: u.used, limit: u.limit }); setUsageError(false); })
      .catch(() => setUsageError(true));
  }
 
  useEffect(loadUsage, []);
 
  async function runSearch(orgId: number) {
    if (running.current.has(orgId)) return;
    running.current.add(orgId);
    setSearches((s) => ({ ...s, [orgId]: { status: "searching" } }));
    try {
      const res = await findWebsite(orgId);
      setSearches((s) => ({ ...s, [orgId]: { status: "done", result: res.result, url: res.website_url } }));
      if (res.result === "saved" && res.website_url) {
        const url = res.website_url;
        setRows((rs) => rs.map((r) => (r.orgId === orgId ? { ...r, website: url } : r)));
      }
      if (res.usage) setUsage(res.usage);
      else loadUsage();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setSearches((s) => ({ ...s, [orgId]: { status: "error", message } }));
      loadUsage(); // a failed search may still have been counted
    } finally {
      running.current.delete(orgId);
    }
  }
 
  async function runBulkSearch() {
    const queue = [...selected].filter((id) => !running.current.has(id));
    setSelected(new Set());
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) await runSearch(id);
    };
    await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, queue.length) }, worker));
  }
 
  function toggleSelected(orgId: number) {
    setSelected((sel) => {
      const next = new Set(sel);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  }
 
  const entityIds = rows.filter((r) => r.firstOfEntity).map((r) => r.orgId);
  const allSelected = entityIds.length > 0 && entityIds.every((id) => selected.has(id));
 
  function load() {
    setStatus("loading");
    fetchRecords()
      .then(({ organizations, people }) => {
        setRows(buildRows(organizations, people));
        setStatus("ready");
      })
      .catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong while contacting the server.");
        setStatus("error");
      });
  }
 
  useEffect(load, []);
 
  return (
    <div>
      <PageHeader
        crumbs={["Home", "Records", "Entities & contacts"]}
        title="Entities & contacts"
        subtitle="Every entity with the contacts on file for it."
      />
 
      <p className="mb-4 text-sm text-muted" aria-live="polite">
        Web searches this month:{" "}
        <span className="font-semibold text-ink">
          {usageError ? "unavailable" : usage === null ? "…" : usage.limit !== null ? `${usage.used} of ${usage.limit}` : usage.used}
        </span>
      </p>
 
      {status === "loading" && (
        <Card title="Loading records…" subtitle="Getting the latest entities and contacts.">
          <div role="status" aria-label="Loading" className="h-2 w-40 animate-pulse rounded bg-line" />
        </Card>
      )}
 
      {status === "error" && (
        <div className="space-y-4">
          <ErrorBanner text={errorMessage} />
          <Button type="button" variant="secondary" onClick={load}>Try again</Button>
        </div>
      )}
 
      {status === "ready" && rows.length === 0 && (
        <Card title="No records yet" subtitle="Entities and their contacts will show up here once records are added.">
          <p className="text-sm text-muted">Use “New Record” in the top bar to add the first one.</p>
        </Card>
      )}
 
      {status === "ready" && rows.length > 0 && (
        <>
        <div className="mb-3 flex items-center gap-3">
          <Button type="button" variant="secondary" disabled={selected.size === 0} onClick={runBulkSearch}>
            Find website for selected{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={th}>
                  <input
                    type="checkbox"
                    aria-label="Select all entities"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(entityIds))}
                  />
                </th>
                <th className={th}>Domain</th>
                <th className={th}>Entity</th>
                <th className={th}>Website</th>
                <th className={th}>Contact</th>
                <th className={th}>Title</th>
                <th className={th}>Email</th>
                <th className={th}>Phone</th>
                <th className={th}>Last updated</th>
                <th className={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-line last:border-0">
                  <td className={td}>
                    {r.firstOfEntity && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.entity}`}
                        checked={selected.has(r.orgId)}
                        onChange={() => toggleSelected(r.orgId)}
                      />
                    )}
                  </td>
                  <td className={td}>
                    <span className="inline-block whitespace-nowrap rounded-full bg-brand/15 px-2.5 py-0.5 text-xs font-semibold text-brand-strong">
                      {r.domain}
                    </span>
                  </td>
                  <td className={`${td} font-semibold`}>
                    {r.entity}
                    {r.flagged && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                        <FlagIcon /> Flagged
                      </span>
                    )}
                  </td>
                  <td className={`${td} text-muted`}>{r.website}</td>
                  <td className={`${td} ${r.noContact ? "italic text-muted" : ""}`}>{r.contact}</td>
                  <td className={`${td} text-muted`}>{r.title}</td>
                  <td className={`${td} break-all`}>{r.email}</td>
                  <td className={`${td} whitespace-nowrap text-muted`}>{r.phone}</td>
                  <td className={`${td} whitespace-nowrap text-muted`}>{r.updated}</td>
                  <td className={td}>
                    {/* Edit / Flag buttons go here (CHUD-15) */}
                    {r.firstOfEntity && (
                      <div className="flex flex-col items-start gap-1.5">
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-8 whitespace-nowrap px-3 text-xs"
                          aria-label={`Find website for ${r.entity}`}
                          disabled={searches[r.orgId]?.status === "searching"}
                          onClick={() => runSearch(r.orgId)}
                        >
                          Find website
                        </Button>
                        <SearchOutcome orgId={r.orgId} state={searches[r.orgId]} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}