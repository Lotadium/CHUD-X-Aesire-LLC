// Written with help from Claude Code (Opus 5.5) (AI assistant). Reviewed and tested by Rachel. See frontend/README.md → "AI assistance".
// Tests for the record history panel (CHUD-57). They use the fake API (sample data), never the real backend:
// organization 1 has earlier versions, organization 2 has only the version it was created with.
import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import RecordHistory from "./RecordHistory";

const domains = [{ id: "1", name: "Fire" }, { id: "2", name: "Water" }];

test("a record with earlier versions lists each one: date, who changed it and what changed", async () => {
  render(<RecordHistory organizationId="1" updatedAt="2026-10-20T19:00:00Z" domains={domains} />);
  expect(screen.getByText("Loading history…")).toBeInTheDocument();

  // Each version is one item in the "Versions" list, newest first
  const list = await screen.findByRole("list", { name: "Versions" });
  const version = (n: number) => within(list).getByText(new RegExp(`^Version ${n}`)).closest("li")!;
  const [newest, middle, first] = [version(3), version(2), version(1)];
  expect(within(list).queryByText(/^Version 4/)).not.toBeInTheDocument();

  expect(within(newest).getByText(/Version 3/)).toBeInTheDocument();
  expect(within(newest).getByText("Current")).toBeInTheDocument();
  expect(within(newest).getByText(/Oct 20, 2026/)).toBeInTheDocument();
  expect(within(newest).getByText(/Refresh \(started by irene\)/)).toBeInTheDocument();
  expect(within(newest).getByText("Website: Not Found → https://metrofire.ca.gov/")).toBeInTheDocument();
  expect(within(newest).getByText("Website search: Not searched yet → Found")).toBeInTheDocument();

  expect(within(middle).getByText(/kathleen/)).toBeInTheDocument();
  expect(within(middle).getByText("Name: Sacramento Metropolitan Fire → Sacramento Metro Fire")).toBeInTheDocument();

  expect(within(first).getByText(/Version 1/)).toBeInTheDocument();
  expect(within(first).getByText("Record created")).toBeInTheDocument();
  expect(screen.queryByText("No earlier versions")).not.toBeInTheDocument();
});

test('a record with no earlier versions shows "No earlier versions"', async () => {
  render(<RecordHistory organizationId="2" updatedAt="2026-10-05T16:30:00Z" domains={domains} />);
  expect(await screen.findByText("No earlier versions")).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: "Versions" })).not.toBeInTheDocument();
});

test("shows the last updated date and links to the activity log filtered to this record", async () => {
  render(<RecordHistory organizationId="2" updatedAt="2026-10-05T16:30:00Z" domains={domains} />);
  expect(screen.getByText("Last updated")).toBeInTheDocument();
  expect(screen.getByText(/Oct 5, 2026/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open activity log for this record" })).toHaveAttribute("href", "#/activity/2");
  await screen.findByText("No earlier versions"); // let the load finish
});

test("shows Not Found when the last updated date is missing", async () => {
  render(<RecordHistory organizationId="2" updatedAt="" domains={domains} />);
  expect(within(screen.getByText("Last updated").parentElement!).getByText("Not Found")).toBeInTheDocument();
  await screen.findByText("No earlier versions");
});

test("shows an error when the history can't be loaded", async () => {
  render(<RecordHistory organizationId="999" updatedAt="" domains={domains} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Organization not found.");
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
});
