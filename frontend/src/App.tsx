import { useState } from "react";
import OrganizationEditForm from "./components/OrganizationEditForm";
import ContactEditForm from "./components/ContactEditForm";

// Temporary page for building and testing the forms.
// Later, Rachel's records list (CHUD-14) will open these forms instead.
export default function App() {
  const [view, setView] = useState<"organization" | "contact">("organization");

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8">
      <div className="flex gap-2">
        <button
          onClick={() => setView("organization")}
          className={`rounded px-3 py-1 ${view === "organization" ? "bg-slate-800 text-white" : "bg-slate-200"}`}
        >
          Organization form
        </button>
        <button
          onClick={() => setView("contact")}
          className={`rounded px-3 py-1 ${view === "contact" ? "bg-slate-800 text-white" : "bg-slate-200"}`}
        >
          Contact form
        </button>
      </div>

      {view === "organization" ? <OrganizationEditForm id="1" /> : <ContactEditForm id="1" />}
    </main>
  );
}
