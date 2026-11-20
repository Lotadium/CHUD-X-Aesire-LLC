// Written with help from Claude Code (Sonnet 5.5) (AI assistant). Reviewed and tested by Irene Riva. See frontend/README.md → "AI assistance".
//
// Record page (CHUD-64): one organization, opened from a search result or the records list (#/records/<id>).
// Read-only: it shows the organization, its website, its contacts and its verified status. Editing
// happens on the existing entity form (#/entity/<id>) and contact form (#/contact/<id>).
import { useEffect, useState } from "react";
import { getOrganization, listContactsForOrganization, listDomains } from "../lib/api";
import type { Contact, Organization } from "../lib/api";
import { nextRefreshBatch, startRefresh } from "../lib/refreshApi";
import WebsiteStatus, { formatDate } from "../components/WebsiteStatus";
import { Button, Card, ErrorBanner, FlagIcon, PageHeader, SavedPill } from "../components/ui";

// Charter 2.3 e.v: a blank value reads "Not Found", never an empty cell
const show = (value: string | undefined) => (value && value.trim() !== "" ? value : "Not Found");

function phoneText(c: Contact): string {
  const main = c.phone.trim() !== "" ? c.phone + (c.phoneExt.trim() !== "" ? ` ext. ${c.phoneExt}` : "") : c.mobilePhone;
  return show(main);
}

type RefreshMessage = { kind: "success" | "warning" | "error"; text: string };

// A refresh of one record is a run of 1: start it, then ask for the next batch until it is done.
const MAX_BATCHES = 20;

export default function RecordPage({ id }: { id: string }) {
  const [org, setOrg] = useState<Organization | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [domainName, setDomainName] = useState("");
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<RefreshMessage | null>(null);

  async function load() {
    const [organization, domains, people] = await Promise.all([getOrganization(id), listDomains(), listContactsForOrganization(id)]);
    setOrg(organization);
    setContacts(people);
    setDomainName(domains.find((d) => d.id === organization.domainId)?.name ?? "");
  }

  useEffect(() => {
    load().catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load this record."));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load() only depends on id
  }, [id]);

  async function handleRefresh() {
    const orgNumber = Number(id);
    if (!Number.isInteger(orgNumber)) {
      setRefreshMessage({ kind: "error", text: "This record's id is not a number, so it can't be refreshed." });
      return;
    }
    setRefreshing(true);
    setRefreshMessage(null);
    try {
      let progress = await startRefresh([orgNumber]);
      for (let i = 0; !progress.done; i++) {
        if (i >= MAX_BATCHES) throw new Error("The refresh did not finish. Try again in a moment.");
        progress = await nextRefreshBatch(progress.run_id);
      }
      await load();
      const problem = progress.unverified[0];
      if (problem) {
        setRefreshMessage({ kind: "warning", text: `Couldn't verify this record: ${problem.detail || problem.reason}` });
      } else {
        setRefreshMessage({ kind: "success", text: progress.updated > 0 ? "Refreshed: new details were saved." : "Refreshed: nothing had changed." });
      }
    } catch (err) {
      setRefreshMessage({ kind: "error", text: err instanceof Error ? err.message : "The refresh failed." });
    } finally {
      setRefreshing(false);
    }
  }

  if (loadError) {
    return (
      <div>
        <PageHeader crumbs={["Records", "Record"]} title="Record" subtitle="Organization details, contacts and history." />
        <ErrorBanner text={loadError} />
      </div>
    );
  }

  if (!org) {
    return (
      <div>
        <PageHeader crumbs={["Records", "Record"]} title="Record" subtitle="Organization details, contacts and history." />
        <p role="status" className="text-sm text-muted">Loading record…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader crumbs={["Records", org.name]} title={org.name} subtitle="Organization details, contacts and history." />
        <div className="flex items-center gap-3">
          <Button type="button" variant="secondary" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <a
            href={`#/entity/${id}`}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-white px-5 text-sm font-semibold text-ink transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-strong"
          >
            Edit
          </a>
        </div>
      </div>

      {refreshMessage?.kind === "error" && <ErrorBanner text={refreshMessage.text} />}
      {refreshMessage?.kind === "warning" && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{refreshMessage.text}</p>
      )}
      {refreshMessage?.kind === "success" && <SavedPill text={refreshMessage.text} />}

      <Card
        title="Organization"
        aside={
          org.flagged ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
              <FlagIcon /> Flagged as no longer valid
            </span>
          ) : org.verifiedAt !== "" ? (
            <SavedPill text={`Verified ${formatDate(org.verifiedAt)}`} />
          ) : (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">Not verified yet</span>
          )
        }
      >
        <dl className="mb-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Domain</dt>
            <dd className="font-medium">{show(domainName)}</dd>
          </div>
          <div>
            <dt className="text-muted">Last updated</dt>
            <dd className="font-medium">{show(formatDate(org.updatedAt))}</dd>
          </div>
          <div>
            <dt className="text-muted">Last verified</dt>
            <dd className="font-medium">{show(formatDate(org.verifiedAt))}</dd>
          </div>
        </dl>
        {org.flagged && org.flagReason !== "" && <p className="mb-5 text-sm text-amber-900">Reason: {org.flagReason}</p>}
        <WebsiteStatus url={org.websiteUrl} source={org.websiteSource} updatedAt={org.websiteUpdatedAt} status={org.websiteStatus} suggestions={org.websiteSuggestions} />
      </Card>

      <Card title="Contacts" subtitle="People on file for this organization.">
        {contacts.length === 0 ? (
          <p className="text-sm text-muted">No contacts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase text-muted">
                  <th scope="col" className="px-3 py-2 font-semibold">Name</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Title</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Email</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Phone</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-medium">
                      <a href={`#/contact/${c.id}`} className="text-brand-strong underline-offset-2 hover:underline">
                        {c.firstName} {c.lastName}
                      </a>
                      {c.flagged && <span className="ml-2 text-xs font-medium text-amber-800">Flagged</span>}
                    </td>
                    <td className="px-3 py-2 text-muted">{show(c.title)}</td>
                    <td className="px-3 py-2 break-all">{show(c.email)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted">{phoneText(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Place for the history panel (CHUD-57, Rachel): earlier versions and a link to the activity log */}
      <Card title="Record history" subtitle="Earlier versions of this record and its activity log.">
        <p className="text-sm text-muted">The history panel will appear here.</p>
      </Card>
    </div>
  );
}
