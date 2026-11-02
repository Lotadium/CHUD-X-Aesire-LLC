// AI use: written with help from Claude (Anthropic).

const BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8787/api";

export type SearchResult = "saved" | "needs_review" | "no_match";

export type SearchUsage = { used: number; limit: number | null };

export type FindWebsiteResponse = {
  result: SearchResult;
  organization: { website_url: string | null };
  usage?: SearchUsage;
};

// Where "needs review" links go. CHUD-50 owns this screen; change the path here once it exists.
export function reviewScreenUrl(organizationId: number): string {
  return `#/review/website/${organizationId}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE_URL + path, {
      ...init,
      headers: { "Content-Type": "application/json", "X-User": import.meta.env.VITE_API_USER ?? "unknown" },
    });
  } catch {
    throw new Error("Can't reach the server. Check that the API is running.");
  }
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  return res.json() as Promise<T>;
}

export function findWebsite(organizationId: number): Promise<FindWebsiteResponse> {
  return request<FindWebsiteResponse>(`/organizations/${organizationId}/website/search`, { method: "POST" });
}

export function fetchSearchUsage(): Promise<SearchUsage & { month: string }> {
  return request("/search-usage");
}
