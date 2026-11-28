// Written with help from Claude Code (Opus 5.5) (AI assistant). Reviewed and tested by Ryan Griffiths. See frontend/README.md → "AI assistance".
//
// (CHUD-54): Every screen in the app and its address. 
// To add a screen, add one line to `screens`.
import type { ReactNode } from "react";
import ContactEditForm from "./components/ContactEditForm";
import OrganizationEditForm from "./components/OrganizationEditForm";
import ActivityLog from "./pages/ActivityLog";
import ComingSoon from "./pages/ComingSoon";
import RecordPage from "./pages/RecordPage";
import RecordsList from "./pages/RecordsList";
import RefreshPage from "./pages/RefreshPage";
import RefreshResultsPage from "./pages/RefreshResultsPage";

type Screen = {
  path: string; // the address after "#/". ":id" stands for a record's id
  render: (id: string) => ReactNode;
} & (
  | { label: string; icon: string; under?: never } // in the menu: its name and icon (an SVG path)
  | { under: string; label?: never; icon?: never } // opened from another screen: the menu item to highlight
);

const screens: Screen[] = [
  { path: "records", label: "Records", icon: "M2.5 4h11M2.5 8h11M2.5 12h11", render: () => <RecordsList /> },
  { path: "search", label: "Search", icon: "M11 7a4 4 0 11-8 0 4 4 0 018 0zM10 10l3.5 3.5", render: () => <ComingSoon title="Search" /> },
  { path: "review", label: "Review", icon: "M2.5 8.5l3.5 3.5 7.5-8", render: () => <ComingSoon title="Review" /> },
  { path: "refresh", label: "Refresh", icon: "M13 8a5 5 0 11-1.5-3.5M13 2.5v2.5h-2.5", render: () => <RefreshPage /> },
  { path: "activity", label: "Activity log", icon: "M14 8A6 6 0 112 8a6 6 0 0112 0zM8 4.5V8l2.5 1.5", render: () => <ActivityLog /> },

  { path: "records/:id", under: "Records", render: (id) => <RecordPage id={id} /> },
  { path: "entity/:id", under: "Records", render: (id) => <OrganizationEditForm id={id} /> },
  { path: "contact/:id", under: "Records", render: (id) => <ContactEditForm id={id} /> },
  { path: "review/website/:id", under: "Review", render: () => <ComingSoon title="Review" /> },
  { path: "refresh/:id", under: "Refresh", render: (id) => <RefreshResultsPage runId={id} /> }, // a run id or "latest" (CHUD-56)
  { path: "activity/:id", under: "Activity log", render: (id) => <ActivityLog organizationId={id} /> }, // filtered to one entity (CHUD-57)
];

export const menu = screens.flatMap((s) => (s.label ? [{ label: s.label, icon: s.icon, href: `#/${s.path}` }] : []));

// The screen for an address like "#/entity/5". An empty or unknown address opens Records.
export function findScreen(hash: string): { active: string; content: ReactNode } {
  const parts = hash.replace(/^#?\/?/, "").replace(/\/$/, "").split("/");
  for (const screen of screens) {
    const pattern = screen.path.split("/");
    const matches = pattern.length === parts.length && pattern.every((p, i) => (p === ":id" ? parts[i] !== "" : p === parts[i]));
    if (!matches) continue;
    const id = parts[pattern.indexOf(":id")] ?? "";
    return { active: screen.label ?? screen.under, content: screen.render(id) };
  }
  return findScreen("#/records");
}
