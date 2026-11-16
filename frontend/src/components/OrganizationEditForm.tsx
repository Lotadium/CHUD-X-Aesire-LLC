// Written with help from Claude Opus 5.5 (AI assistant). Reviewed and tested by Kathleen Collier.
// See frontend/README.md → "AI assistance".

import { useEffect, useState } from "react";
import { getOrganization, updateOrganization, setOrganizationFlag, listDomains, type Organization, type RecordDates, type WebsiteSource, type WebsiteStatusValue } from "../lib/api";
import { organizationSchema } from "../lib/validation";
import { displayUrl, sameWebsite } from "../lib/website";
import ConfirmDialog from "./ConfirmDialog";
import FormField, { SelectField } from "./FormField";
import FlagReasonField from "./FlagReasonField";
import WebsiteStatus from "./WebsiteStatus";
import { Button, Card, ErrorBanner, FlagIcon, FlaggedBanner, PageHeader, SavedPill } from "./ui";

// Edit form for an entity (an "organization" in the database).
// The screen copy says "entity" to match the Figma mockups.
// There is no delete: per the project charter (2.3 f.iv), a record that is no longer
// valid is FLAGGED instead, and stays in the database with its history.

// What the form holds while the user types (every input is text)
type FormValues = { name: string; domainId: string; websiteUrl: string };
type FieldName = keyof FormValues;

// The website as last loaded/saved (CHUD-31), shown above the form fields
type SavedWebsite = { url: string; source: WebsiteSource; updatedAt: string; status: WebsiteStatusValue; suggestions: number };
const toSavedWebsite = (org: Organization): SavedWebsite => ({
  url: org.websiteUrl,
  source: org.websiteSource,
  updatedAt: org.websiteUpdatedAt,
  status: org.websiteStatus,
  suggestions: org.websiteSuggestions,
});

type Cleaned = { name: string; domainId: string; websiteUrl: string };

// The record's system dates (CHUD-36, charter 2.3 g.i and g.iv), set by the database
const toDates = (org: Organization): RecordDates => ({
  createdAt: org.createdAt,
  updatedAt: org.updatedAt,
  verifiedAt: org.verifiedAt,
});
function formatDateTime(iso: string) {
  return iso
    ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";
}

// Run the Zod schema and turn its errors into { fieldName: "message" }
function validate(values: FormValues): Partial<Record<FieldName, string>> {
  const result = organizationSchema.safeParse(values);
  if (result.success) return {};
  const errors: Partial<Record<FieldName, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as FieldName;
    if (!errors[field]) errors[field] = issue.message; // keep the first message per field
  }
  return errors;
}

const header = (
  <PageHeader
    crumbs={["Records", "Edit entity"]}
    title="Edit Entity"
    subtitle="Update the entity's details and save, or flag it if it's no longer valid."
  />
);

export default function OrganizationEditForm({ id }: { id: string }) {
  const [values, setValues] = useState<FormValues | null>(null); // null = not loaded yet
  const [domains, setDomains] = useState<{ id: string; name: string }[]>([]); // options for the Domain dropdown
  const [loadError, setLoadError] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [saving, setSaving] = useState(false); // true while the save request is running
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false); // is the "are you sure?" dialog showing?
  const [flag, setFlag] = useState({ flagged: false, flagReason: "" }); // charter: flag, never delete
  const [flagReason, setFlagReason] = useState(""); // what the user types in the dialog
  const [flagging, setFlagging] = useState(false);
  const [savedName, setSavedName] = useState(""); // name as last loaded/saved, shown in the flag dialog
  const [savedWebsite, setSavedWebsite] = useState<SavedWebsite>({ url: "", source: "", updatedAt: "", status: "", suggestions: 0 });
  // Changes waiting for "Replace/Remove the website on file?" to be confirmed (CHUD-30 rule)
  const [pendingSave, setPendingSave] = useState<Cleaned | null>(null);
  const [dates, setDates] = useState<RecordDates>({ createdAt: "", updatedAt: "", verifiedAt: "" });

  // Runs once when the form appears (and again if the id changes):
  // load the entity AND the domain list at the same time
  useEffect(() => {
    Promise.all([getOrganization(id), listDomains()])
      .then(([org, domainList]) => {
        setValues({ name: org.name, domainId: org.domainId, websiteUrl: org.websiteUrl });
        setFlag({ flagged: org.flagged, flagReason: org.flagReason });
        setSavedName(org.name);
        setSavedWebsite(toSavedWebsite(org));
        setDates(toDates(org));
        setDomains(domainList);
      })
      .catch((err) => setLoadError(err.message));
  }, [id]);

  // Update one field, keep the rest. If that field is already showing an error,
  // re-check it as the user types so the message disappears as soon as it's fixed.
  function setField(field: FieldName, value: string) {
    if (!values) return;
    const next = { ...values, [field]: value };
    setValues(next);
    setMessage(null);
    if (errors[field]) {
      setErrors({ ...errors, [field]: validate(next)[field] });
    }
  }

  // When the user leaves a field, check just that field
  function handleBlur(field: FieldName) {
    if (!values) return;
    setErrors({ ...errors, [field]: validate(values)[field] });
  }

  // On submit: check every field, then save
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); // stop the browser from reloading the page
    if (!values) return;
    setMessage(null);
    const allErrors = validate(values);
    setErrors(allErrors);
    if (Object.keys(allErrors).length > 0) {
      setMessage({ type: "error", text: "Fix the highlighted fields, then save again." });
      return; // stop here if anything is invalid
    }

    // The cleaned-up values (trimmed by Zod)
    const cleaned = organizationSchema.parse(values);

    // Replacing or removing a website that is already saved needs a "yes" first.
    // The API refuses it otherwise (Irene's CHUD-30 rule), so ask before sending.
    if (savedWebsite.url !== "" && !sameWebsite(cleaned.websiteUrl, savedWebsite.url)) {
      setPendingSave(cleaned);
      return;
    }
    await save(cleaned, false);
  }

  // Send the changes to the API. confirmOverwrite = the user said yes to replacing the website.
  async function save(cleaned: Cleaned, confirmOverwrite: boolean) {
    setSaving(true);
    try {
      const saved = await updateOrganization(id, cleaned, { confirmOverwrite });
      setValues({ name: saved.name, domainId: saved.domainId, websiteUrl: saved.websiteUrl });
      setSavedName(saved.name);
      setSavedWebsite(toSavedWebsite(saved));
      setDates(toDates(saved));
      setMessage({ type: "success", text: "Changes saved" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Something went wrong. Try again." });
    } finally {
      setSaving(false); // runs whether the save worked or failed
      setPendingSave(null);
    }
  }

  // Flag or unflag the record. Flagging only runs after the user confirms in the dialog.
  async function changeFlag(flagged: boolean) {
    setFlagging(true);
    setMessage(null);
    try {
      const saved = await setOrganizationFlag(id, flagged, flagReason);
      setFlag({ flagged: saved.flagged, flagReason: saved.flagReason });
      setDates(toDates(saved));
      // The yellow banner shows the flag; only confirm when it is removed
      if (!flagged) setMessage({ type: "success", text: "Flag removed" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Could not update the flag. Try again." });
    } finally {
      setFlagging(false);
      setConfirmOpen(false);
      setFlagReason("");
    }
  }

  if (loadError) return <>{header}<ErrorBanner text={loadError} /></>;
  if (!values) return <>{header}<p className="text-muted">Loading…</p></>;

  return (
    <form onSubmit={handleSubmit} noValidate>
      {header}

      <Card
        title="Entity details"
        subtitle="The entity's name, business type, and website."
        aside={message?.type === "success" ? <SavedPill text={message.text} /> : undefined}
      >
        {flag.flagged && <FlaggedBanner reason={flag.flagReason} busy={flagging} onUnflag={() => changeFlag(false)} />}

        <div className="mb-5">
          <WebsiteStatus
            url={savedWebsite.url}
            source={savedWebsite.source}
            updatedAt={savedWebsite.updatedAt}
            status={savedWebsite.status}
            suggestions={savedWebsite.suggestions}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <FormField
            id="name"
            label="Entity Name"
            value={values.name}
            error={errors.name}
            onChange={(v) => setField("name", v)}
            onBlur={() => handleBlur("name")}
          />
          <SelectField
            id="domainId"
            label="Domain"
            placeholder="Select a domain…"
            options={domains}
            value={values.domainId}
            error={errors.domainId}
            onChange={(v) => setField("domainId", v)}
            onBlur={() => handleBlur("domainId")}
          />
          <FormField
            id="websiteUrl"
            label="Website URL"
            optional
            value={values.websiteUrl}
            error={errors.websiteUrl}
            onChange={(v) => setField("websiteUrl", v)}
            onBlur={() => handleBlur("websiteUrl")}
          />
        </div>

        {message?.type === "error" && (
          <div className="mt-5">
            <ErrorBanner text={message.text} />
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          {/* type="button" so this does NOT submit the form; it only opens the dialog.
              Hidden once the record is flagged (the banner has "Remove flag" instead). */}
          {!flag.flagged ? (
            <Button type="button" variant="warning-ghost" className="-ml-3 px-3" onClick={() => setConfirmOpen(true)}>
              <FlagIcon />
              Flag as no longer valid
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>

        {/* System dates (CHUD-36): set by the database, not editable */}
        <p className="mt-4 text-sm text-muted" data-testid="record-dates">
          Created {formatDateTime(dates.createdAt)} · Last updated {formatDateTime(dates.updatedAt)} · Last verified{" "}
          {formatDateTime(dates.verifiedAt)}
        </p>
      </Card>

      {confirmOpen && (
        <ConfirmDialog
          title={`Flag ${savedName} as no longer valid?`}
          message="The entity stays in the database with its history, but it will be marked as no longer valid. You can remove the flag later."
          confirmLabel="Flag record"
          busyLabel="Flagging…"
          busy={flagging}
          confirmDisabled={flagReason.trim() === ""}
          onConfirm={() => changeFlag(true)}
          onCancel={() => {
            setConfirmOpen(false);
            setFlagReason("");
          }}
        >
          <FlagReasonField value={flagReason} onChange={setFlagReason} />
        </ConfirmDialog>
      )}

      {pendingSave && (
        <ConfirmDialog
          title={pendingSave.websiteUrl === "" ? "Remove the website on file?" : "Replace the website on file?"}
          message={
            pendingSave.websiteUrl === ""
              ? `${displayUrl(savedWebsite.url)} will be removed from this entity. The old website stays in the record history.`
              : `${displayUrl(savedWebsite.url)} will be replaced with ${displayUrl(pendingSave.websiteUrl)}. The old website stays in the record history.`
          }
          confirmLabel={pendingSave.websiteUrl === "" ? "Remove website" : "Replace website"}
          busyLabel="Saving…"
          busy={saving}
          onConfirm={() => save(pendingSave, true)}
          onCancel={() => setPendingSave(null)}
        />
      )}
    </form>
  );
}
