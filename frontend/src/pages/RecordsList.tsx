import { useEffect, useState } from "react";
import { fetchRecords } from "../lib/recordsApi";
import type { Organization, Person } from "../lib/recordsApi";
import { Button, Card, ErrorBanner, FlagIcon, PageHeader } from "../components/ui";

type Row = {
  key: string; domain: string; entity: string; website: string; flagged: boolean;
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
      rows.push({ key: `org-${org.organization_id}`, ...base, noContact: true, contact: "No contacts yet", title: "—", email: "—", phone: "—" });
      continue;
    }
    for (const person of contacts) {
      const pos = person.positions.find((x) => x.organization_id === org.organization_id)!;
      rows.push({
        key: `${org.organization_id}-${person.person_id}`, ...base, noContact: false,
        contact: `${person.first_name} ${person.last_name}`,
        title: pos.title ?? "—",
        email: person.emails.find((e) => !e.is_flagged)?.address ?? "—",
        phone: pos.phone ?? "—",
      });
    }
  }
  return rows;
}

const th = "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted";
const td = "px-4 py-3 align-top";

export default function RecordsList() {
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [rows, setRows] = useState<Row[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

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
        <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead>
              <tr className="border-b border-line">
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
                  <td className={td}>{/* Edit / Flag buttons go here (CHUD-15) */}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}