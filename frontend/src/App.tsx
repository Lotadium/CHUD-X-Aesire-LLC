import { useState } from "react";
import AppShell from "./components/AppShell";
import OrganizationEditForm from "./components/OrganizationEditForm";
import ContactEditForm from "./components/ContactEditForm";

// Temporary page for building and testing the forms.
// Later, Rachel's records list (CHUD-14) will open these forms instead.
export default function App() {
  const [view, setView] = useState<"entity" | "contact">("entity");

  // Pill tabs, styled like the Reports screen's filter chips
  const tab = (key: "entity" | "contact", label: string) => (
    <button
      type="button"
      onClick={() => setView(key)}
      aria-pressed={view === key}
      className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
        view === key ? "border-brand bg-brand text-ink" : "border-line bg-white text-ink hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );

  return (
    <AppShell>
      <div className="mb-8 flex gap-2">
        {tab("entity", "Entity form")}
        {tab("contact", "Contact form")}
      </div>
      {view === "entity" ? <OrganizationEditForm id="1" /> : <ContactEditForm id="1" />}
    </AppShell>
  );
}
