import { mockOrganizations, mockPeople } from "./mock/records";
import type { Organization, Person } from "./mock/records";

const USE_MOCK = true;
const API_URL = "http://localhost:8787/api";

// Only used when USE_MOCK is true.
// Change "ok" to "error", "empty" or "loading" to test those screens.
const SIMULATE = "ok" as "ok" | "error" | "empty" | "loading";

export async function fetchRecords(): Promise<{ organizations: Organization[]; people: Person[] }> {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 800)); // fake wait
    if (SIMULATE === "loading") await new Promise(() => {}); // never finishes
    if (SIMULATE === "error") throw new Error("Could not reach the server");
    if (SIMULATE === "empty") return { organizations: [], people: [] };
    return { organizations: mockOrganizations, people: mockPeople };
  }

  const [orgRes, peopleRes] = await Promise.all([
    fetch(`${API_URL}/organizations?limit=200`),
    fetch(`${API_URL}/people?limit=200`),
  ]);
  if (!orgRes.ok || !peopleRes.ok) throw new Error("API request failed");
  const orgs = await orgRes.json();
  const people = await peopleRes.json();
  return { organizations: orgs.data, people: people.data };
}