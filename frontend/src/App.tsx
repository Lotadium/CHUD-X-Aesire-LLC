import { useEffect, useState } from "react";
import AppShell from "./components/AppShell";
import OrganizationEditForm from "./components/OrganizationEditForm";
import ContactEditForm from "./components/ContactEditForm";
import RecordsList from "./pages/RecordsList";
import RecordPage from "./pages/RecordPage";
import RefreshPage from "./pages/RefreshPage";
import RefreshResultsPage from "./pages/RefreshResultsPage";
import ActivityLog from "./pages/ActivityLog";
import HomePage from "./pages/HomePage";

type View = "home" | "records" | "record" | "refresh" | "refreshResults" | "entity" | "contact" | "activity";

// Which screen to show comes from the address bar, so a link like #/entity/5 opens entity 5
// (the activity log links each entry to its record this way, CHUD-38).
//   #/home (the app opens here)   #/records   #/records/<id>   #/refresh   #/refresh/<run id or "latest">   #/activity   #/entity/<id>   #/contact/<id>
function readHash(): { view: View; id: string } {
  const [, view, id] = window.location.hash.split("/");
  if (view === undefined || view === "" || view === "home") return { view: "home", id: "" }; // the Home page (CHUD-66)
  if (view === "records" && id) return { view: "record", id }; // the record page (CHUD-64)
  if (view === "refresh" && id) return { view: "refreshResults", id }; // refresh results (CHUD-56)
  if (view === "entity" || view === "contact") return { view, id: id || "1" };
  if (view === "activity" || view === "refresh") return { view, id: "" };
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
    <AppShell active={route.view === "home" ? "Home" : route.view === "refresh" || route.view === "refreshResults" ? "Refresh" : undefined}>
      <div className="mb-8 flex flex-wrap gap-2">
        {tab("records", "Records list", "#/records")}
        {tab("record", "Record page", "#/records/1")}
        {tab("entity", "Entity form", "#/entity/1")}
        {tab("contact", "Contact form", "#/contact/1")}
        {tab("activity", "Activity log", "#/activity")}
      </div>
      {route.view === "home" && <HomePage />}
      {route.view === "records" && <RecordsList />}
      {route.view === "record" && <RecordPage key={route.id} id={route.id} />}
      {route.view === "refresh" && <RefreshPage />}
      {route.view === "refreshResults" && <RefreshResultsPage key={route.id} runId={route.id} />}
      {/* key: a new id loads a fresh form */}
      {route.view === "entity" && <OrganizationEditForm key={route.id} id={route.id} />}
      {route.view === "contact" && <ContactEditForm key={route.id} id={route.id} />}
      {route.view === "activity" && <ActivityLog />}
    </AppShell>
  );
}