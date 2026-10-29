export interface SearchOperators {
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
export type SearchResults = Array<SearchResult>;

export interface SearchProvider<SearchConfig> {
  endpoint: string;
  Operators: SearchOperators;
  RequestHeaders: Headers;
  search(query: string, config: SearchConfig): Promise<SearchResults>;
}
