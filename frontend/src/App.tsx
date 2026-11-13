import { useState } from "react";
import AppShell from "./components/AppShell";
import OrganizationEditForm from "./components/OrganizationEditForm";
import ContactEditForm from "./components/ContactEditForm";
import RecordsList from "./pages/RecordsList";
import RefreshPage from "./pages/RefreshPage";

type View = "records" | "refresh" | "entity" | "contact";

// Temporary page for building and testing the screens.
// Later, the records list (CHUD-14) will open the edit forms instead of using tabs.
export default function App() {
  const [view, setView] = useState<View>("records");

  // Pill tabs, styled like the Reports screen's filter chips
  const tab = (key: View, label: string) => (
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
        {tab("records", "Records list")}
        {tab("refresh", "Refresh")}
        {tab("entity", "Entity form")}
        {tab("contact", "Contact form")}
      </div>
      {view === "records" && <RecordsList />}
      {view === "refresh" && <RefreshPage />}
      {view === "entity" && <OrganizationEditForm id="1" />}
      {view === "contact" && <ContactEditForm id="1" />}
    </AppShell>
  );
}