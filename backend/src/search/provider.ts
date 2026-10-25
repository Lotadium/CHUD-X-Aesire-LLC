interface SearchOperators {
  escape(query: string): string;
  explicit(phrase: string): string;
  exclude?(phrase: string): string;
  domain?(hostname: string): string;
  filetype?(ext: string): string;
  before?(date: Date): string;
  after?(date: Date): string;
  Extra?: Record<string, (phrase: string) => string>; // miscellaneous/provider-specific search operators
}

type SearchResult = {
  title: string;
  url: string;
  description: string;
};
type SearchResults = Array<SearchResult>;

interface SearchProvider<SearchConfig> {
  endpoint: string;
  Operators: SearchOperators;
  RequestHeaders: Headers;
  search(query: string, config: SearchConfig): Promise<SearchResults>;
}

export type { SearchOperators };

if (!process.env.BRAVE_API_KEY) throw new Error("Failed to build provider: BRAVE_API_KEY is missing.");
if (!process.env.BRAVE_SEARCH_ENDPOINT) throw new Error("Failed to build provider: BRAVE_SEARCH_ENDPOINT is missing.");
interface BraveResponseData {
  web: {
    results: Array<SearchResult>;
  };
}
interface BraveRequestConfig {
  limit: number;
  safesearch: boolean;
}
export const Brave: SearchProvider<BraveRequestConfig> = {
  endpoint: process.env.BRAVE_SEARCH_ENDPOINT,
  Operators: {
    escape(query) { return encodeURIComponent(query.trim().replace(/\s+/g, " ")) },
    explicit(phrase) { return `"${phrase}"` },
    exclude(phrase) { return `-${this.explicit(phrase)}` },
    domain(hostname) { return `site:${hostname}` },
    filetype(ext) { return `filetype:${ext}` },
    Extra: {
      title(phrase) { return `intitle:${phrase}` },
      body(phrase) { return `inbody:${phrase}` },
      content(phrase) { return `inpage:${phrase}` } // matches content in the page title or body
    }
  },
  RequestHeaders: new Headers({
    "X-Subscription-Token": process.env.BRAVE_API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json",
  }),
  async search(query, config) {
    const response: Response = await fetch(this.endpoint, {
      method: "post",
      headers: this.RequestHeaders,
      body: JSON.stringify({
        q: query,
        result_filters: "web",
        count: config.limit,
        spellcheck: false,
        operators: true,
        safesearch: config.safesearch
      })
    });
    const body = await response.json() as BraveResponseData;
    if (response.ok) {
      const results: SearchResults = [];
      for (const result of body.web.results)
        results.push(result);
      return results;
    } else {
      throw new Error(`Request Error ${response.status}: ${response.statusText || "unknown"}`);
    }
  }
};
