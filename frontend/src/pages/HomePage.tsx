// Written with help from Claude Code (Sonnet 5.5) (AI assistant). Reviewed and tested by Irene Riva. See frontend/README.md → "AI assistance".
//
// Home page (CHUD-66): the landing page from the Figma "Screen 1 (App Shell)", with a card for each main
// action (charter 2.3 j.i: staff use refresh, new record and reports). A card without a `href` is not
// built yet and says "Coming soon" instead of linking to a page that does not exist.
import type { ReactNode } from "react";

type Action = { title: string; description: string; icon: ReactNode; href?: string };

const ACTIONS: Action[] = [
  {
    title: "Refresh",
    description: "Verify and update existing records against their current sources.",
    icon: <path d="M13 8a5 5 0 11-1.5-3.5M13 2.5v2.5h-2.5" />,
    href: "#/refresh",
  },
  {
    title: "New Record",
    description: "Add a new entity by searching its name or website.",
    icon: <path d="M8 3v10M3 8h10" />,
  },
  {
    title: "Reports",
    description: "View updated, recent, and unresolved record summaries.",
    icon: <path d="M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V6.5" />,
  },
];

function ActionCard({ action }: { action: Action }) {
  const body = (
    <>
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/15 text-brand-strong">
        <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {action.icon}
        </svg>
      </span>
      <span className="mt-5 block text-lg font-semibold">{action.title}</span>
      <span className="mt-1.5 block text-sm text-muted">{action.description}</span>
      {action.href ? (
        <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand-strong">
          Open <span aria-hidden="true">→</span>
        </span>
      ) : (
        <span className="mt-5 inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">Coming soon</span>
      )}
    </>
  );

  const card = "block rounded-xl border border-line bg-white p-7 shadow-sm";
  return action.href ? (
    <a
      href={action.href}
      aria-label={`Open ${action.title}`}
      className={`${card} transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-strong`}
    >
      {body}
    </a>
  ) : (
    <div role="group" aria-label={`${action.title} (coming soon)`} className={`${card} opacity-80`}>
      {body}
    </div>
  );
}

export default function HomePage() {
  return (
    <div>
      <h1 className="text-4xl font-bold tracking-tight">Client Tracking App</h1>
      <p className="mt-2 text-muted">Choose an action to get started.</p>
      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        {ACTIONS.map((a) => (
          <ActionCard key={a.title} action={a} />
        ))}
      </div>
    </div>
  );
}
