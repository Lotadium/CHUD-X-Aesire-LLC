// Data for the records list page (CHUD-14). Talks to Irene's API (backend/README.md).
const BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:8787/api";

export type Organization = {
  organization_id: number;
  name: string;
  website_url: string | null;
  domain_name?: string | null;
  date_last_updated?: string | null;
  is_flagged?: boolean | null;
};

export type Person = {
  person_id: number;
  first_name: string;
  last_name: string;
  positions: {
    position_id: number;
    organization_id: number;
    title: string | null;
    phone: string | null;
  }[];
  emails: { email_id: number; address: string; is_flagged?: boolean | null }[];
};

async function get<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE_URL + path);
  } catch {
    throw new Error("Can't reach the server. Check that the API is running.");
  }
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  return res.json() as Promise<T>;
}

export async function fetchRecords(): Promise<{ organizations: Organization[]; people: Person[] }> {
  const [orgs, people] = await Promise.all([
    get<{ data: Organization[] }>("/organizations?limit=200"),
    get<{ data: Person[] }>("/people?limit=200"),
  ]);
  return { organizations: orgs.data, people: people.data };
}