// Small shared building blocks that match the Figma mockups:
// page header, white card, buttons, status pill, and message banner.
import type { ComponentProps, ReactNode } from "react";

// "Records / Edit entity" breadcrumb, big title, grey helper text
export function PageHeader({ crumbs, title, subtitle }: { crumbs: string[]; title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        {crumbs.join(" / ")}
      </nav>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-muted">{subtitle}</p>
    </div>
  );
}

// White card with a title row; `aside` sits on the right of the title (e.g. a status pill)
export function Card({ title, subtitle, aside, children }: { title: string; subtitle?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

type ButtonProps = ComponentProps<"button"> & { variant?: "primary" | "secondary" | "warning-ghost" | "success" };

const buttonStyles = {
  primary: "bg-brand text-ink hover:bg-brand-hover",
  secondary: "border border-line bg-white text-ink hover:bg-slate-50",
  "warning-ghost": "text-amber-800 hover:bg-amber-50",
  success: "bg-green-700 text-white hover:bg-green-800", // "Done" in the all-verified pop-up
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-strong disabled:cursor-not-allowed disabled:opacity-50 ${buttonStyles[variant]} ${className}`}
    />
  );
}

// Green "✓ Saved" pill, like "Saved to database" in the mockups
export function SavedPill({ text }: { text: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {text}
    </span>
  );
}

// Red message box for problems that aren't tied to one field
export function ErrorBanner({ text }: { text: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <span aria-hidden="true" className="mt-px font-bold">!</span>
      <span>{text}</span>
    </div>
  );
}

// Flag icon for "Flag as no longer valid"
export function FlagIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M3.5 14V2.5M3.5 3h8l-1.5 3 1.5 3h-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Amber box shown on a record that is flagged as no longer valid (charter 2.3 f.iv).
// The record is kept; authorized staff can remove the flag if it was a mistake.
export function FlaggedBanner({ reason, busy, onUnflag }: { reason: string; busy: boolean; onUnflag: () => void }) {
  return (
    <div role="status" className="mb-5 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="flex items-start gap-2">
        <span className="mt-0.5"><FlagIcon /></span>
        <div>
          <p className="font-semibold">Flagged as no longer valid</p>
          <p className="mt-0.5">{reason ? `Reason: ${reason.replace(/[.!?]?$/, ".")}` : "No reason given."} The record and its history are kept.</p>
        </div>
      </div>
      <Button type="button" variant="secondary" className="h-8 px-3 text-xs" onClick={onUnflag} disabled={busy}>
        {busy ? "Removing flag…" : "Remove flag"}
      </Button>
    </div>
  );
}
