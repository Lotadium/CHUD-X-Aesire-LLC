import { useEffect, useState } from "react";
import { getContact, updateContact, deleteContact, listOrganizations } from "../lib/api";
import { contactSchema } from "../lib/validation";
import ConfirmDialog from "./ConfirmDialog";
import FormField, { SelectField } from "./FormField";
import { Button, Card, ErrorBanner, PageHeader, SavedPill, TrashIcon } from "./ui";

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

const header = (
  <PageHeader
    crumbs={["Records", "Edit contact"]}
    title="Edit Contact"
    subtitle="Update the contact's details and save, or delete them from the database."
  />
);

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
  const [savedName, setSavedName] = useState(""); // name as last loaded/saved, shown in the delete dialog

  // Load the contact AND the entity list at the same time
  useEffect(() => {
    Promise.all([getContact(id), listOrganizations()])
      .then(([contact, orgs]) => {
        const { id: _id, ...fields } = contact; // everything except the id goes into the form
        setValues(fields);
        setSavedName(`${fields.firstName} ${fields.lastName}`);
        setOrganizations(orgs);
      })
      .catch((err) => setLoadError(err.message));
  }, [id]);

  function setField(field: FieldName, value: string) {
    if (!values) return;
    const next = { ...values, [field]: value };
    setValues(next);
    setMessage(null);
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
      setSavedName(`${saved.firstName} ${saved.lastName}`);
      setMessage({ type: "success", text: "Changes saved" });
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

  if (deleted) {
    return (
      <>
        {header}
        <Card title="Contact deleted." subtitle="The contact and their positions and email addresses were removed." aside={<SavedPill text="Deleted" />}>
          <></>
        </Card>
      </>
    );
  }
  if (loadError) return <>{header}<ErrorBanner text={loadError} /></>;
  if (!values) return <>{header}<p className="text-muted">Loading…</p></>;

  // Shortcut: everything FormField needs for one field
  const field = (name: FieldName, label: string, optional = false, className = "") => (
    <FormField
      id={name}
      label={label}
      optional={optional}
      className={className}
      value={values[name]}
      error={errors[name]}
      onChange={(v) => setField(name, v)}
      onBlur={() => handleBlur(name)}
    />
  );

  return (
    <form onSubmit={handleSubmit} noValidate>
      {header}

      <Card
        title="Contact details"
        subtitle="Who this person is, where they work, and how to reach them."
        aside={message?.type === "success" ? <SavedPill text={message.text} /> : undefined}
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* Person */}
          {field("firstName", "First Name")}
          {field("middleName", "Middle Name", true)}
          {field("lastName", "Last Name")}

          {/* Position: where they work */}
          <SelectField
            id="organizationId"
            label="Entity"
            placeholder="Select an entity…"
            options={organizations}
            value={values.organizationId}
            error={errors.organizationId}
            onChange={(v) => setField("organizationId", v)}
            onBlur={() => handleBlur("organizationId")}
          />
          {field("title", "Title", true, "md:col-span-2")}

          {/* How to reach them */}
          {field("phone", "Phone", true)}
          {field("phoneExt", "Ext.", true)}
          {field("mobilePhone", "Mobile Phone", true)}
          {field("email", "Email", true, "md:col-span-2")}
        </div>

        {message?.type === "error" && (
          <div className="mt-5">
            <ErrorBanner text={message.text} />
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <Button type="button" variant="danger-ghost" className="-ml-3 px-3" onClick={() => setConfirmOpen(true)}>
            <TrashIcon />
            Delete contact
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Card>

      {confirmOpen && (
        <ConfirmDialog
          title={`Delete ${savedName}?`}
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
