import type { ReactNode } from "react";

// The black top bar from the Figma mockups: Aesire badge, app name, and main tabs.
// Refresh opens the Refresh page (CHUD-56). The other tabs are placeholders until the
// navigation menu (CHUD-54) connects them.

const icons: Record<string, ReactNode> = {
  Home: <path d="M2.5 7.5L8 3l5.5 4.5V13a.5.5 0 01-.5.5H10V10H6v3.5H3a.5.5 0 01-.5-.5z" />,
  Refresh: <path d="M13 8a5 5 0 11-1.5-3.5M13 2.5v2.5h-2.5" />,
  "New Record": <path d="M8 3v10M3 8h10" />,
  Reports: <path d="M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V6.5" />,
};

// Where each tab goes. A tab without one is still a placeholder.
const links: Record<string, string> = {
  Home: "#/home",
  Refresh: "#/refresh",
};

// `active`: the tab for the screen being shown, highlighted in the bar
export default function AppShell({ children, active }: { children: ReactNode; active?: string }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-ink text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-6">
          <div className="flex items-center gap-2">
            <span className="rounded bg-brand px-1.5 py-0.5 text-xs font-semibold text-ink">Aesire</span>
            <span className="font-semibold">Client Tracking App</span>
          </div>
          <nav aria-label="Main" className="hidden items-center gap-6 text-sm sm:flex">
            {Object.entries(icons).map(([label, path]) => (
              <a
                key={label}
                href={links[label] ?? "#"}
                aria-current={active === label ? "page" : undefined}
                className={`flex items-center gap-1.5 border-b-2 py-1 hover:text-white ${
                  active === label ? "border-brand text-white" : "border-transparent text-white/90"
                }`}
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {path}
                </svg>
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
