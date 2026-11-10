// AI use: written with help from Claude (Anthropic).
// Tests for the activity log page (CHUD-38). The server is faked with a stubbed fetch, using made-up records.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import ActivityLog from "./ActivityLog";

const orgs = [
  { organization_id: 1, name: "Test Fire District", website_url: null },
  { organization_id: 2, name: "Sample Water Agency", website_url: null },
];

const entries = [
  {
    activity_id: 3, occurred_at: "2026-11-10T20:00:00Z", action: "FLAGGED", record_type: "email", record_id: 9,
    organization_id: null, person_id: 4, organization_name: null, person_name: "Ann Example",
    actor_type: "USER", actor_name: "rachel", detail: "Reason: Bounced",
  },
  {
    activity_id: 2, occurred_at: "2026-11-09T20:00:00Z", action: "REFRESH_SUCCESS", record_type: "organization", record_id: 1,
    organization_id: 1, person_id: null, organization_name: "Test Fire District", person_name: null,
    actor_type: "REFRESH", actor_name: "irene", detail: "Website search: URL saved: https://testfire.example",
  },
  {
    activity_id: 1, occurred_at: "2026-11-08T20:00:00Z", action: "CREATED", record_type: "organization", record_id: 1,
    organization_id: 1, person_id: null, organization_name: "Test Fire District", person_name: null,
    actor_type: "USER", actor_name: "rachel", detail: "Entity created: Test Fire District",
  },
];

let activityResponse: () => Promise<Response>;
let activityUrls: string[] = [];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  activityUrls = [];
  activityResponse = () => json({ data: entries, total: entries.length });
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (url.endsWith("/organizations?limit=200")) return json({ data: orgs });
    if (url.endsWith("/people?limit=200")) return json({ data: [] });
    if (url.includes("/activity?")) {
      activityUrls.push(url);
      return activityResponse();
    }
    return json({}, 404);
  }));
});

afterEach(() => vi.unstubAllGlobals());

test("lists entries newest first, with who did it", async () => {
  render(<ActivityLog />);
  const rows = await screen.findAllByRole("row");
  // header row + 3 entries, in the order the server sends (newest first)
  expect(rows).toHaveLength(4);
  expect(within(rows[1]).getByText("Flagged no longer valid")).toBeInTheDocument();
  expect(within(rows[1]).getByText("rachel")).toBeInTheDocument();
  expect(within(rows[2]).getByText("Refresh")).toBeInTheDocument();
  expect(within(rows[2]).getByText("started by irene")).toBeInTheDocument();
  expect(within(rows[3]).getByText("Created")).toBeInTheDocument();
});

test("links each entry to its record", async () => {
  render(<ActivityLog />);
  expect(await screen.findByRole("link", { name: "Ann Example (email)" })).toHaveAttribute("href", "#/contact/4");
  const entityLinks = screen.getAllByRole("link", { name: "Test Fire District" });
  expect(entityLinks[0]).toHaveAttribute("href", "#/entity/1");
});

test("filters by action type and entity", async () => {
  const user = userEvent.setup();
  render(<ActivityLog />);
  await screen.findAllByRole("row");
  await screen.findByRole("option", { name: "Sample Water Agency" });

  await user.selectOptions(screen.getByLabelText("Action"), "FLAGGED");
  await user.selectOptions(screen.getByLabelText("Entity"), "2");

  const last = new URL(activityUrls.at(-1)!);
  expect(last.searchParams.get("action")).toBe("FLAGGED");
  expect(last.searchParams.get("organization_id")).toBe("2");
});

test("shows an empty state when there is no activity yet", async () => {
  activityResponse = () => json({ data: [], total: 0 });
  render(<ActivityLog />);
  expect(await screen.findByText("No activity yet")).toBeInTheDocument();
});

test("shows a different message when filters match nothing", async () => {
  const user = userEvent.setup();
  render(<ActivityLog />);
  await screen.findAllByRole("row");
  activityResponse = () => json({ data: [], total: 0 });
  await user.selectOptions(screen.getByLabelText("Action"), "REFRESH_ATTEMPT");
  expect(await screen.findByText("No matching activity")).toBeInTheDocument();
});

test("shows an error with Try again when the server can't be reached", async () => {
  const user = userEvent.setup();
  activityResponse = () => Promise.reject(new TypeError("Failed to fetch"));
  render(<ActivityLog />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the server");
  activityResponse = () => json({ data: entries, total: entries.length });
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findAllByRole("row")).toHaveLength(4);
});
