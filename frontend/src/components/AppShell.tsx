// Written with help from Claude Code (Opus 5.5) (AI assistant). Reviewed and tested by Ryan Griffiths. See frontend/README.md → "AI assistance".
// 
// (CHUD-54):The navigation menu
import type { ReactNode } from "react";
import { menu } from "../screens";

// The black top bar from the Figma mockups: Aesire badge, app name, and the main menu.
// The menu items come from screens.tsx.

type Props = {
  children: ReactNode;
  active?: string; // the menu item for the screen being shown
};

export default function AppShell({ children, active }: Props) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-ink text-white">
        <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-6 py-2">
          <div className="flex items-center gap-2">
            <span className="rounded bg-brand px-1.5 py-0.5 text-xs font-semibold text-ink">Aesire</span>
            <span className="font-semibold">Client Tracking App</span>
          </div>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            {menu.map(({ label, icon, href }) => (
              <a
                key={label}
                href={href}
                aria-current={active === label ? "page" : undefined}
                className={`flex items-center gap-1.5 border-b-2 py-1 hover:text-white ${
                  active === label ? "border-brand font-semibold text-white" : "border-transparent text-white/90"
                }`}
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={icon} />
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
