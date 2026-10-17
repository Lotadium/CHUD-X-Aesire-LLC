import { mockOrganizations, mockPeople } from "./mock/records";
import type { Organization, Person } from "./mock/records";

// Change to "error" or "empty" to test those screens.
const SIMULATE: "ok" | "error" | "empty" = "ok";

export async function fetchRecords(): Promise<{ organizations: Organization[]; people: Person[] }> {
  await new Promise((resolve) => setTimeout(resolve, 800)); // fake wait so you can see loading
  if (SIMULATE === "error") throw new Error("Could not reach the server");
  if (SIMULATE === "empty") return { organizations: [], people: [] };
  return { organizations: mockOrganizations, people: mockPeople };
}