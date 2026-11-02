// Small helpers for website URLs (CHUD-31), shared by the entity page and the fake API.
// Written with help from Claude Opus 5.5 (AI assistant). See frontend/README.md → "AI assistance".

// Always link to http(s), even if the saved value has no scheme ("metrofire.ca.gov")
export function toHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// "https://www.metrofire.ca.gov/" -> "www.metrofire.ca.gov"
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

// Do two typed/saved values point at the same website?
// "metrofire.ca.gov" and "https://metrofire.ca.gov" are the same, because the API adds https:// before saving.
export function sameWebsite(a: string, b: string): boolean {
  const norm = (v: string) => (v.trim() === "" ? "" : toHref(v.trim()));
  return norm(a) === norm(b);
}
