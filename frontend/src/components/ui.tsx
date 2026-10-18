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

type ButtonProps = ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" | "danger-ghost" };

const buttonStyles = {
  primary: "bg-brand text-ink hover:bg-brand-hover",
  secondary: "border border-line bg-white text-ink hover:bg-slate-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  "danger-ghost": "text-red-700 hover:bg-red-50",
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

// Trash-can icon for delete buttons
export function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
