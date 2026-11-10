import { useEffect, useState } from "react";
import AppShell from "./components/AppShell";
import OrganizationEditForm from "./components/OrganizationEditForm";
import ContactEditForm from "./components/ContactEditForm";
import RecordsList from "./pages/RecordsList";
import ActivityLog from "./pages/ActivityLog";

type View = "records" | "entity" | "contact" | "activity";

// Which screen to show comes from the address bar, so a link like #/entity/5 opens entity 5
// (the activity log links each entry to its record this way, CHUD-38).
//   #/records   #/activity   #/entity/<id>   #/contact/<id>
function readHash(): { view: View; id: string } {
  const [, view, id] = window.location.hash.split("/");
  if (view === "entity" || view === "contact") return { view, id: id || "1" };
  if (view === "activity") return { view, id: "" };
  return { view: "records", id: "" };
}

// Temporary page for building and testing the screens.
// Later, the records list (CHUD-14) will open the edit forms instead of using tabs.
export default function App() {
  const [route, setRoute] = useState(readHash);

  useEffect(() => {
    const onChange = () => setRoute(readHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  // Pill tabs, styled like the Reports screen's filter chips
  const tab = (key: View, label: string, hash: string) => (
    <a
      href={hash}
      aria-current={route.view === key ? "page" : undefined}
      className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
        route.view === key ? "border-brand bg-brand text-ink" : "border-line bg-white text-ink hover:bg-slate-50"
      }`}
    >
      {label}
    </a>
  );

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap gap-2">
        {tab("records", "Records list", "#/records")}
        {tab("entity", "Entity form", "#/entity/1")}
        {tab("contact", "Contact form", "#/contact/1")}
        {tab("activity", "Activity log", "#/activity")}
      </div>
      {route.view === "records" && <RecordsList />}
      {/* key: a new id loads a fresh form */}
      {route.view === "entity" && <OrganizationEditForm key={route.id} id={route.id} />}
      {route.view === "contact" && <ContactEditForm key={route.id} id={route.id} />}
      {route.view === "activity" && <ActivityLog />}
    </AppShell>
  );
}
