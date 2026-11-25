import { useEffect, useMemo, useState } from "react";
import { searchContacts, type ContactSearchFilters, type ContactSearchResult } from "../lib/api";
import { Button, Card, ErrorBanner, PageHeader } from "../components/ui";

type SearchForm = Required<ContactSearchFilters>;

const EMPTY_FILTERS: SearchForm = {
  query: "",
  title: "",
  fieldOfWork: "",
  organization: "",
};

const PAGE_SIZE = 10;

function show(value: string | undefined): string {
  return value && value.trim() !== "" ? value : "Not Found";
}

function contactName(contact: ContactSearchResult): string {
  return [contact.firstName, contact.middleName, contact.lastName]
    .filter((part) => part.trim() !== "")
    .join(" ");
}

function optionsFrom(results: ContactSearchResult[], field: "title" | "fieldOfWork" | "organizationName"): string[] {
  return [...new Set(results.map((result) => result[field]).filter((value) => value.trim() !== ""))]
    .sort((a, b) => a.localeCompare(b));
}

export default function SearchPage() {
  const [filters, setFilters] = useState<SearchForm>(EMPTY_FILTERS);
  const [allResults, setAllResults] = useState<ContactSearchResult[]>([]);
  const [results, setResults] = useState<ContactSearchResult[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    let active = true;
    searchContacts()
      .then((found) => {
        if (!active) return;
        setAllResults(found);
        setResults(found);
        setStatus("ready");
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Could not load contacts.");
        setStatus("error");
      });

    return () => { active = false; };
  }, []);

  async function runSearch(next: SearchForm) {
    setStatus("loading");
    setError("");
    setVisibleCount(PAGE_SIZE);

    try {
      setResults(await searchContacts(next));
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not search contacts.");
      setStatus("error");
    }
  }

  function updateFilter(field: keyof SearchForm, value: string) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function clearFilters() {
    const next = { ...filters, title: "", fieldOfWork: "", organization: "" };
    setFilters(next);
    void runSearch(next);
  }

  const titles = useMemo(() => optionsFrom(allResults, "title"), [allResults]);
  const fieldsOfWork = useMemo(() => optionsFrom(allResults, "fieldOfWork"), [allResults]);
  const organizations = useMemo(() => optionsFrom(allResults, "organizationName"), [allResults]);
  const shownResults = results.slice(0, visibleCount);

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={["Home", "Search"]}
        title="Search contacts"
        subtitle="Find staff by name, title, field of work, or organization."
      />

      <Card title="Search and filters">
        <form
          aria-label="Contact search"
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch(filters);
          }}
          className="space-y-5"
        >
          <div>
            <label htmlFor="contact-search" className="mb-1 block text-sm font-medium">Search</label>
            <input
              id="contact-search"
              value={filters.query}
              onChange={(event) => updateFilter("query", event.target.value)}
              placeholder="Name, job title, organization, or field of work"
              className="h-10 w-full rounded-lg border border-line px-3 text-sm focus:border-brand-strong focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="text-sm font-medium">
              Job title
              <select
                aria-label="Job title"
                value={filters.title}
                onChange={(event) => updateFilter("title", event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 font-normal"
              >
                <option value="">All job titles</option>
                {titles.map((title) => <option key={title} value={title}>{title}</option>)}
              </select>
            </label>

            <label className="text-sm font-medium">
              Field of work
              <select
                aria-label="Field of work"
                value={filters.fieldOfWork}
                onChange={(event) => updateFilter("fieldOfWork", event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 font-normal"
              >
                <option value="">All fields of work</option>
                {fieldsOfWork.map((field) => <option key={field} value={field}>{field}</option>)}
              </select>
            </label>

            <label className="text-sm font-medium">
              Organization
              <select
                aria-label="Organization"
                value={filters.organization}
                onChange={(event) => updateFilter("organization", event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 font-normal"
              >
                <option value="">All organizations</option>
                {organizations.map((organization) => <option key={organization} value={organization}>{organization}</option>)}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit">Search</Button>
            <Button type="button" variant="secondary" onClick={clearFilters}>Clear filters</Button>
          </div>
        </form>
      </Card>

      {status === "loading" && (
        <Card title="Loading contacts…">
          <p role="status" className="text-sm text-muted">Searching the contact records…</p>
        </Card>
      )}

      {status === "error" && <ErrorBanner text={error} />}

      {status === "ready" && results.length === 0 && (
        <Card title="No match found">
          <p role="status" className="text-sm text-muted">Try clearing the filters or changing your search.</p>
        </Card>
      )}

      {status === "ready" && results.length > 0 && (
        <section aria-label="Search results" className="space-y-3">
          <p className="text-sm text-muted">Showing {shownResults.length} of {results.length} results</p>
          {shownResults.map((contact) => (
            <article key={`${contact.organizationId}-${contact.id}`} className="rounded-xl border border-line bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <a href={`#/records/${contact.organizationId}`} className="text-lg font-semibold text-brand-strong hover:underline">
                    {contactName(contact)}
                  </a>
                  <p className="mt-1 text-sm text-muted">{show(contact.title)} · {show(contact.organizationName)}</p>
                </div>
                <a href={`#/records/${contact.organizationId}`} className="text-sm font-medium text-brand-strong hover:underline">Open record</a>
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-muted">Job title</dt><dd>{show(contact.title)}</dd></div>
                <div><dt className="text-muted">Organization</dt><dd>{show(contact.organizationName)}</dd></div>
                <div><dt className="text-muted">Email</dt><dd className="break-all">{show(contact.email)}</dd></div>
                <div><dt className="text-muted">Phone</dt><dd>{show(contact.phone)}</dd></div>
              </dl>
            </article>
          ))}
          {visibleCount < results.length && (
            <Button type="button" variant="secondary" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
              Show more
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
