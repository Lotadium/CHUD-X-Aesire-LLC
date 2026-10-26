// Written with help from Claude Opus 5.5 (AI assistant) for CHUD-31.
// See frontend/README.md → "AI assistance".

import type { WebsiteSource } from "../lib/api";

// The saved website on the entity page (CHUD-31):
//   - a link that opens the site in a new tab, or "No website yet"
//   - whether it was found automatically (website discovery, CHUD-29/30) or typed in by staff
//   - when the website was last updated
// It shows what is SAVED, not what is being typed in the form, so staff can tell the two apart.

// Always link to http(s), even if the saved value has no scheme ("metrofire.ca.gov")
export function toHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// "https://www.metrofire.ca.gov/" -> "www.metrofire.ca.gov"
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

// "2026-10-20T19:00:00Z" -> "Oct 20, 2026" (blank or bad dates show nothing)
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (iso === "" || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const sourceBadge: Record<Exclude<WebsiteSource, "">, { label: string; className: string }> = {
  auto: { label: "Found automatically", className: "bg-brand/15 text-brand-strong" },
  manual: { label: "Entered manually", className: "bg-slate-100 text-slate-700" },
};

export default function WebsiteStatus({ url, source, updatedAt }: { url: string; source: WebsiteSource; updatedAt: string }) {
  const date = formatDate(updatedAt);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-canvas px-4 py-3 text-sm">
      <span className="font-medium text-ink">Website on file:</span>

      {url === "" ? (
        <span className="text-muted">No website yet</span>
      ) : (
        <>
          <a
            href={toHref(url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 break-all font-medium text-brand-strong underline-offset-2 hover:underline"
          >
            {displayUrl(url)}
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M9 3h4v4M13 3L7.5 8.5M12 9.5V13H3V4h3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          {source !== "" && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${sourceBadge[source].className}`}>
              {sourceBadge[source].label}
            </span>
          )}
          {date && <span className="text-muted">Updated {date}</span>}
        </>
      )}
    </div>
  );
}
