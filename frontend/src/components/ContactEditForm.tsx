import { useEffect, useState } from "react";
import { getContact, updateContact, deleteContact, listOrganizations } from "../lib/api";
import { contactSchema } from "../lib/validation";
import ConfirmDialog from "./ConfirmDialog";
import FormField from "./FormField";

// What the form holds while the user types (every input is text)
type FormValues = {
  firstName: string;
  middleName: string;
  lastName: string;
  organizationId: string;
  title: string;
  phone: string;
  phoneExt: string;
  mobilePhone: string;
  email: string;
};
type FieldName = keyof FormValues;

// Run the Zod schema and turn its errors into { fieldName: "message" }
function validate(values: FormValues): Partial<Record<FieldName, string>> {
  const result = contactSchema.safeParse(values);
  if (result.success) return {};
  const errors: Partial<Record<FieldName, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as FieldName;
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
}

export default function ContactEditForm({ id }: { id: string }) {
  const [values, setValues] = useState<FormValues | null>(null); // null = not loaded yet
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [loadError, setLoadError] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  // Load the contact AND the organization list at the same time
  useEffect(() => {
    Promise.all([getContact(id), listOrganizations()])
      .then(([contact, orgs]) => {
        const { id: _id, ...fields } = contact; // everything except the id goes into the form
        setValues(fields);
        setOrganizations(orgs);
      })
      .catch((err) => setLoadError(err.message));
  }, [id]);

  function setField(field: FieldName, value: string) {
    if (!values) return;
    const next = { ...values, [field]: value };
    setValues(next);
    if (errors[field]) {
      setErrors({ ...errors, [field]: validate(next)[field] });
    }
  }

  function handleBlur(field: FieldName) {
    if (!values) return;
    setErrors({ ...errors, [field]: validate(values)[field] });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values) return;
    setMessage(null);
    const allErrors = validate(values);
    setErrors(allErrors);
    if (Object.keys(allErrors).length > 0) {
      setMessage({ type: "error", text: "Fix the highlighted fields, then save again." });
      return;
    }
    setSaving(true);
    try {
      const cleaned = contactSchema.parse(values); // trimmed, email lowercased
      const { id: _id, ...saved } = await updateContact(id, cleaned);
      setValues(saved);
      setMessage({ type: "success", text: "Changes saved." });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Something went wrong. Try again." });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteContact(id);
      setDeleted(true);
    } catch (err) {
      setConfirmOpen(false);
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Could not delete. Try again." });
    } finally {
      setDeleting(false);
    }
  }

  if (deleted) return <p role="status" className="text-green-700">Contact deleted.</p>;
  if (loadError) return <p className="text-red-700">{loadError}</p>;
  if (!values) return <p className="text-slate-500">Loading…</p>;

  // Shortcut: everything FormField needs for one field, so each field below is one line
  const field = (name: FieldName, label: string, optional = false) => (
    <FormField
      id={name}
      label={label}
      optional={optional}
      value={values[name]}
      error={errors[name]}
      onChange={(v) => setField(name, v)}
      onBlur={() => handleBlur(name)}
    />
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-lg space-y-4 rounded-lg bg-white p-6 shadow">
      <h2 className="text-xl font-semibold">Edit contact</h2>

      {/* Person */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {field("firstName", "First name")}
        {field("middleName", "Middle name", true)}
        {field("lastName", "Last name")}
      </div>

      {/* Position: where they work */}
      <div>
        <label htmlFor="organizationId" className="block text-sm font-medium">Organization *</label>
        <select
          id="organizationId"
          className={`mt-1 w-full rounded border px-3 py-2 ${errors.organizationId ? "border-red-500" : "border-slate-300"}`}
          value={values.organizationId}
          onChange={(e) => setField("organizationId", e.target.value)}
          onBlur={() => handleBlur("organizationId")}
          aria-invalid={!!errors.organizationId}
          aria-describedby={errors.organizationId ? "organizationId-error" : undefined}
        >
          <option value="">Choose an organization…</option>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        {errors.organizationId && (
          <p id="organizationId-error" className="mt-1 text-sm text-red-700">{errors.organizationId}</p>
        )}
      </div>
      {field("title", "Title", true)}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">{field("phone", "Phone", true)}</div>
        {field("phoneExt", "Ext.", true)}
      </div>
      {field("mobilePhone", "Mobile phone", true)}

      {/* Email */}
      {field("email", "Email", true)}

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
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="rounded border border-red-700 px-4 py-2 font-medium text-red-700 hover:bg-red-50"
        >
          Delete contact
        </button>
      </div>

      {confirmOpen && (
        <ConfirmDialog
          title={`Delete ${values.firstName} ${values.lastName}?`}
          message="This permanently removes the contact, including their positions and email addresses. This can't be undone."
          confirmLabel="Delete"
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </form>
  );
}
