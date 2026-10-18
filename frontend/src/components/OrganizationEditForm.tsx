import { useEffect, useState } from "react";
import { getOrganization, updateOrganization, deleteOrganization, listDomains } from "../lib/api";
import ConfirmDialog from "./ConfirmDialog";
import { organizationSchema } from "../lib/validation"; // NEW

// What the form holds while the user types (every input is text)
type FormValues = { name: string; domainId: string; websiteUrl: string };
type FieldName = keyof FormValues;

// NEW: run the Zod schema and turn its errors into { fieldName: "message" }
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

// NEW: red border when a field has an error
const inputClass = (hasError: boolean) =>
  `mt-1 w-full rounded border px-3 py-2 ${hasError ? "border-red-500" : "border-slate-300"}`;

export default function OrganizationEditForm({ id }: { id: string }) {
  const [values, setValues] = useState<FormValues | null>(null); // null = not loaded yet
  const [domains, setDomains] = useState<{ id: string; name: string }[]>([]); // options for the Domain dropdown
  const [loadError, setLoadError] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({}); // NEW
  const [saving, setSaving] = useState(false); // true while the save request is running
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false); // is the "are you sure?" dialog showing?
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  // Runs once when the form appears (and again if the id changes): load the record
  useEffect(() => {
    // Load the organization AND the domain list at the same time
    Promise.all([getOrganization(id), listDomains()])
      .then(([org, domainList]) => {
        setValues({ name: org.name, domainId: org.domainId, websiteUrl: org.websiteUrl });
        setDomains(domainList);
      })
      .catch((err) => setLoadError(err.message));
  }, [id]);

  // Update one field, keep the rest.
  // NEW: if that field is already showing an error, re-check it as the user types
  // so the message disappears as soon as it's fixed.
  function setField(field: FieldName, value: string) {
    if (!values) return;
    const next = { ...values, [field]: value };
    setValues(next);
    if (errors[field]) {
      setErrors({ ...errors, [field]: validate(next)[field] });
    }
  }

  // NEW: when the user leaves a field, check just that field
  function handleBlur(field: FieldName) {
    if (!values) return;
    setErrors({ ...errors, [field]: validate(values)[field] });
  }

  // NEW: on submit, check every field. (Saving comes in Part 3.)
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
      setMessage({ type: "success", text: "Changes saved." });
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

  if (deleted) return <p role="status" className="text-green-700">Organization deleted.</p>;
  if (loadError) return <p className="text-red-700">{loadError}</p>;
  if (!values) return <p className="text-slate-500">Loading…</p>;

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-lg space-y-4 rounded-lg bg-white p-6 shadow">
      <h2 className="text-xl font-semibold">Edit organization</h2>

      <div>
        <label htmlFor="name" className="block text-sm font-medium">Organization name *</label>
        <input
          id="name"
          className={inputClass(!!errors.name)}
          value={values.name}
          onChange={(e) => setField("name", e.target.value)}
          onBlur={() => handleBlur("name")}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "name-error" : undefined}
        />
        {errors.name && <p id="name-error" className="mt-1 text-sm text-red-700">{errors.name}</p>}
      </div>

      <div>
        <label htmlFor="domainId" className="block text-sm font-medium">Domain *</label>
        <select
          id="domainId"
          className={inputClass(!!errors.domainId)}
          value={values.domainId}
          onChange={(e) => setField("domainId", e.target.value)}
          onBlur={() => handleBlur("domainId")}
          aria-invalid={!!errors.domainId}
          aria-describedby={errors.domainId ? "domainId-error" : undefined}
        >
          <option value="">Choose a domain…</option>
          {domains.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        {errors.domainId && <p id="domainId-error" className="mt-1 text-sm text-red-700">{errors.domainId}</p>}
      </div>

      <div>
        <label htmlFor="websiteUrl" className="block text-sm font-medium">Website (optional)</label>
        <input
          id="websiteUrl"
          className={inputClass(!!errors.websiteUrl)}
          value={values.websiteUrl}
          onChange={(e) => setField("websiteUrl", e.target.value)}
          onBlur={() => handleBlur("websiteUrl")}
          aria-invalid={!!errors.websiteUrl}
          aria-describedby={errors.websiteUrl ? "websiteUrl-error" : undefined}
        />
        {errors.websiteUrl && <p id="websiteUrl-error" className="mt-1 text-sm text-red-700">{errors.websiteUrl}</p>}
      </div>

      {message && (
        <p role="status" className={message.type === "success" ? "text-green-700" : "text-red-700"}>
          {message.text}
        </p>
      )}

      <div className="flex justify-between">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>

        {/* type="button" so this does NOT submit the form; it only opens the dialog */}
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="rounded border border-red-700 px-4 py-2 font-medium text-red-700 hover:bg-red-50"
        >
          Delete organization
        </button>
      </div>

      {confirmOpen && (
        <ConfirmDialog
          title={`Delete ${values.name}?`}
          message="This permanently removes the organization. Contacts who work there lose this position, but the people are kept. This can't be undone."
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </form>
  );
}
