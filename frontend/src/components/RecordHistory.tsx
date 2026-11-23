// Written with help from Claude Code (Opus 5.5) (AI assistant). Reviewed and tested by Rachel. See frontend/README.md → "AI assistance".
//
// Record history panel (CHUD-57, charter 2.3 c): sits on the record page (CHUD-64) and shows when the
// record was last updated, every saved version (date, who changed it, what changed) from the CHUD-36
// history endpoint, and a link to the activity log filtered to this record (CHUD-38).
import { useEffect, useState } from "react";
import { getOrganizationHistory } from "../lib/api";
import type { RecordVersion } from "../lib/api";
import { changedByText, describeChanges, formatDateTime } from "../lib/recordHistory";
import { Button, Card, ErrorBanner } from "./ui";

type Props = {
  organizationId: string;
  updatedAt: string; // the record's last updated date (ISO text, or "")
  domains: { id: string; name: string }[]; // to show a changed domain by name
};

export default function RecordHistory({ organizationId, updatedAt, domains }: Props) {
  const [versions, setVersions] = useState<RecordVersion[] | null>(null);
  const [error, setError] = useState("");

  function load() {
    setError("");
    setVersions(null);
    getOrganizationHistory(organizationId)
      .then(setVersions)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the record history."));
  }

  // Reload when the record changes (for example after Refresh saved something new)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load() only depends on these
  useEffect(load, [organizationId, updatedAt]);

  return (
    <Card
      title="Record history"
      subtitle="Earlier versions of this record and its activity log."
      aside={
        <a
          href={`#/activity/${encodeURIComponent(organizationId)}`}
          className="text-sm font-semibold text-brand-strong underline-offset-2 hover:underline"
        >
          Open activity log for this record
        </a>
      }
    >
      <dl className="mb-5 text-sm">
        <dt className="text-muted">Last updated</dt>
        <dd className="font-medium">{formatDateTime(updatedAt)}</dd>
      </dl>

      {error !== "" && (
        <div className="space-y-3">
          <ErrorBanner text={error} />
          <Button type="button" variant="secondary" onClick={load}>Try again</Button>
        </div>
      )}

      {error === "" && versions === null && <p role="status" className="text-sm text-muted">Loading history…</p>}

      {/* Only the version the record was created with: nothing has changed since */}
      {versions !== null && versions.length <= 1 && <p className="text-sm text-muted">No earlier versions</p>}

      {versions !== null && versions.length > 1 && (
        <ol aria-label="Versions" className="divide-y divide-line">
          {versions.map((v, i) => {
            const changes = describeChanges(v.changes, domains);
            return (
              <li key={v.version} className="py-3 first:pt-0 last:pb-0 text-sm">
                <p className="font-medium">
                  Version {v.version}
                  {i === 0 && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">Current</span>}
                </p>
                <p className="text-muted">
                  {formatDateTime(v.changedAt)} · {changedByText(v)}
                </p>
                {v.version === 1 ? (
                  <p className="mt-1">Record created</p>
                ) : changes.length === 0 ? (
                  <p className="mt-1 text-muted">No visible fields changed</p>
                ) : (
                  <ul className="mt-1 list-disc pl-5">
                    {changes.map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
