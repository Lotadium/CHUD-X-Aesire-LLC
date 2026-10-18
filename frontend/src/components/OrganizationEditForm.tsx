// Written with help from Claude Opus 5.5 (AI assistant). Reviewed and tested by Kathleen Collier.
// See frontend/README.md → "AI assistance".

import { useEffect, useState } from "react";
import { getOrganization, updateOrganization, deleteOrganization, listDomains } from "../lib/api";
import { organizationSchema } from "../lib/validation";
import ConfirmDialog from "./ConfirmDialog";
import FormField, { SelectField } from "./FormField";
import { Button, Card, ErrorBanner, PageHeader, SavedPill, TrashIcon } from "./ui";

// Edit form for an entity (an "organization" in the database).
// The screen copy says "entity" to match the Figma mockups.

// What the form holds while the user types (every input is text)
type FormValues = { name: string; domainId: string; websiteUrl: string };
type FieldName = keyof FormValues;

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
    subtitle="Update the entity's details and save, or delete it from the database."
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
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [savedName, setSavedName] = useState(""); // name as last loaded/saved, shown in the delete dialog

  // Runs once when the form appears (and again if the id changes):
  // load the entity AND the domain list at the same time
  useEffect(() => {
    Promise.all([getOrganization(id), listDomains()])
      .then(([org, domainList]) => {
        setValues({ name: org.name, domainId: org.domainId, websiteUrl: org.websiteUrl });
        setSavedName(org.name);
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

    // Save: send the cleaned-up values (trimmed by Zod) to the API
    setSaving(true);
    try {
      const cleaned = organizationSchema.parse(values);
      const saved = await updateOrganization(id, cleaned);
      setValues({ name: saved.name, domainId: saved.domainId, websiteUrl: saved.websiteUrl });
      setSavedName(saved.name);
      setMessage({ type: "success", text: "Changes saved" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Something went wrong. Try again." });
    } finally {
      setSaving(false); // runs whether the save worked or failed
    }
  }

  // Only runs after the user clicks Delete inside the confirmation dialog
  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteOrganization(id);
      setDeleted(true);
    } catch (err) {
      setConfirmOpen(false);
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Could not delete. Try again." });
    } finally {
      setDeleting(false);
    }
  }

  if (deleted) {
    return (
      <>
        {header}
        <Card title="Entity deleted." subtitle="The entity was removed. Its contacts were kept." aside={<SavedPill text="Deleted" />}>
          <></>
        </Card>
      </>
    );
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
          {/* type="button" so this does NOT submit the form; it only opens the dialog */}
          <Button type="button" variant="danger-ghost" className="-ml-3 px-3" onClick={() => setConfirmOpen(true)}>
            <TrashIcon />
            Delete entity
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Card>

      {confirmOpen && (
        <ConfirmDialog
          title={`Delete ${savedName}?`}
          message="This permanently removes the entity. Contacts who work there lose this position, but the people are kept. This can't be undone."
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </form>
  );
}
