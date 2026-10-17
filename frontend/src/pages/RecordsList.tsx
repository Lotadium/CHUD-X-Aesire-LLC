import { useEffect, useState } from "react";
import { fetchRecords } from "../api";
import type { Organization, Person } from "../mock/records";

type Row = {
  key: string; domain: string; entity: string; website: string;
  contact: string; title: string; email: string; phone: string; updated: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// One row per contact. An entity with no contacts still gets one row.
function buildRows(orgs: Organization[], people: Person[]): Row[] {
  const rows: Row[] = [];
  for (const org of orgs) {
    const base = {
      domain: org.domain_name, entity: org.name, website: org.website_url ?? "—",
      updated: formatDate(org.date_last_updated),
    };
    const contacts = people.filter((p) =>
      p.positions.some((pos) => pos.organization_id === org.organization_id),
    );
    if (contacts.length === 0) {
      rows.push({ key: `org-${org.organization_id}`, ...base, contact: "No contacts yet", title: "—", email: "—", phone: "—" });
      continue;
    }
    for (const person of contacts) {
      const pos = person.positions.find((x) => x.organization_id === org.organization_id)!;
      rows.push({
        key: `${org.organization_id}-${person.person_id}`, ...base,
        contact: `${person.first_name} ${person.last_name}`,
        title: pos.title ?? "—",
        email: person.emails[0]?.address ?? "—",
        phone: pos.phone ?? "—",
      });
    }
  }
  return rows;
}

export default function RecordsList() {
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [rows, setRows] = useState<Row[]>([]);

  function load() {
    setStatus("loading");
    fetchRecords()
      .then(({ organizations, people }) => {
        setRows(buildRows(organizations, people));
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }

  useEffect(load, []);

  return (
    <main className="page">
      <p className="crumbs">Home / Records / Entities &amp; contacts</p>
      <h1>Entities &amp; contacts</h1>
      <p className="sub">Every entity with the contacts on file for it.</p>

      {status === "loading" && <p className="state">Loading records…</p>}

      {status === "error" && (
        <div className="state error">
          <h2>We couldn’t load the records</h2>
          <p>Something went wrong while contacting the server.</p>
          <button onClick={load}>Try again</button>
        </div>
      )}

      {status === "ready" && rows.length === 0 && (
        <div className="state">
          <h2>No records yet</h2>
          <p>Entities and their contacts will show up here once records are added.</p>
        </div>
      )}

      {status === "ready" && rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Domain</th><th>Entity</th><th>Website</th><th>Contact</th>
              <th>Title</th><th>Email</th><th>Phone</th><th>Last updated</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td><span className="chip">{r.domain}</span></td>
                <td>{r.entity}</td><td>{r.website}</td><td>{r.contact}</td>
                <td>{r.title}</td><td>{r.email}</td><td>{r.phone}</td><td>{r.updated}</td>
                <td>{/* Edit / Delete buttons go here (CHUD-15) */}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}