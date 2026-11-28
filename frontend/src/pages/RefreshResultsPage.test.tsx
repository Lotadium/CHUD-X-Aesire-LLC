// AI use: written with help from Claude (Anthropic).
// Tests for the refresh results screen (CHUD-56): the counts match the API, the unverified records are
// listed with their reasons and links to fix them, and "Check again" re-runs one record.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import type { RefreshProgress, RefreshRunResult, RefreshRunSummary } from "../lib/refreshApi";

const api = vi.hoisted(() => ({
  getRefreshRun: vi.fn(),
  listRefreshRuns: vi.fn(),
  startRefresh: vi.fn(),
  nextRefreshBatch: vi.fn(),
}));
vi.mock("../lib/refreshApi", () => api);

import RefreshResultsPage from "./RefreshResultsPage";

const run = (over: Partial<RefreshRunResult> = {}): RefreshRunResult => ({
  run_id: "12",
  requested_by: "kathleen",
  created_at: "2026-11-22T18:00:00Z",
  finished_at: "2026-11-22T18:04:00Z",
  done: true,
  total: 50,
  processed: 50,
  verified: 47,
  updated: 6,
  unverified_count: 3,
  unverified: [
    { organization_id: 3, name: "Hartley Water District", reason: "website not found", detail: "No website was found for this record", reason_code: "NO_WEBSITE_FOUND", changed: false },
    { organization_id: 22, name: "Delta Resource Conservation", reason: "site unreachable", detail: "The website could not be reached", reason_code: "SITE_UNREACHABLE", changed: true },
    { organization_id: 47, name: "Oak Park Recreation", reason: "website not found", detail: "No website was found for this record", reason_code: "NO_WEBSITE_FOUND", changed: false },
  ],
  ...over,
});

const { unverified: _unused, ...summary12 } = run();
const recent: RefreshRunSummary[] = [summary12, { ...summary12, run_id: "11", verified: 50, updated: 2, unverified_count: 0 }];

const progress = (over: Partial<RefreshProgress> = {}): RefreshProgress => ({
  run_id: "13", total: 1, processed: 1, verified: 1, updated: 0, unverified: [], done: true, ...over,
});

beforeEach(() => {
  api.getRefreshRun.mockReset().mockResolvedValue(run());
  api.listRefreshRuns.mockReset().mockResolvedValue(recent);
  api.startRefresh.mockReset();
  api.nextRefreshBatch.mockReset();
});

const counts = async () => within(await screen.findByLabelText("Refresh counts"));

test("shows the verified, updated and unverified counts exactly as the API returned them", async () => {
  render(<RefreshResultsPage runId="12" />);

  expect(await screen.findByRole("heading", { name: "Refresh #12" })).toBeInTheDocument();
  expect(api.getRefreshRun).toHaveBeenCalledWith("12");
  const c = await counts();
  const value = (label: string) => c.getByText(label).nextElementSibling?.textContent;
  expect(value("Records checked")).toBe("50");
  expect(value("Verified")).toBe("47");
  expect(value("Updated")).toBe("6");
  expect(value("Couldn’t be verified")).toBe("3");
  expect(screen.getByText(/by kathleen/)).toBeInTheDocument();
});

test("lists every unverified record with its reason, and links to open it and update it by hand", async () => {
  render(<RefreshResultsPage runId="12" />);

  expect(await screen.findByRole("heading", { name: "3 records need attention" })).toBeInTheDocument();
  const table = screen.getByRole("table");
  const rows = within(table).getAllByRole("row").slice(1); // skip the header
  expect(rows).toHaveLength(3);

  const delta = rows[1];
  expect(within(delta).getByText("Delta Resource Conservation")).toBeInTheDocument();
  expect(within(delta).getByText("site unreachable")).toBeInTheDocument();
  expect(within(delta).getByText("The website could not be reached")).toBeInTheDocument();
  expect(within(delta).getByText("Some new details were still saved")).toBeInTheDocument();
  expect(within(delta).getByRole("link", { name: "Open record: Delta Resource Conservation" })).toHaveAttribute("href", "#/records/22");
  expect(within(delta).getByRole("link", { name: "Update by hand: Delta Resource Conservation" })).toHaveAttribute("href", "#/entity/22");
});

test("filters the list by reason", async () => {
  const user = userEvent.setup();
  render(<RefreshResultsPage runId="12" />);
  await screen.findByRole("table");

  await user.selectOptions(screen.getByLabelText("Reason"), "NO_WEBSITE_FOUND");

  const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
  expect(rows.map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual(["Hartley Water District", "Oak Park Recreation"]);
});

test("Check again re-runs the refresh for one record and shows when it's verified", async () => {
  const user = userEvent.setup();
  api.startRefresh.mockResolvedValue(progress({ processed: 0, verified: 0, done: false }));
  api.nextRefreshBatch.mockResolvedValue(progress());
  render(<RefreshResultsPage runId="12" />);

  await user.click(await screen.findByRole("button", { name: "Check again: Hartley Water District" }));

  expect(api.startRefresh).toHaveBeenCalledWith([3]);
  expect(api.nextRefreshBatch).toHaveBeenCalledWith("13");
  expect(await screen.findByText("Verified now")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Check again: Hartley Water District" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "2 records need attention" })).toBeInTheDocument();
});

test("Check again says why when the record still can't be verified", async () => {
  const user = userEvent.setup();
  api.startRefresh.mockResolvedValue(
    progress({
      verified: 0,
      unverified: [{ organization_id: 3, name: "Hartley Water District", reason: "website not found", detail: "Still no website found", reason_code: "NO_WEBSITE_FOUND" }],
    }),
  );
  render(<RefreshResultsPage runId="12" />);

  await user.click(await screen.findByRole("button", { name: "Check again: Hartley Water District" }));

  expect(await screen.findByText("Still not verified: Still no website found")).toBeInTheDocument();
  expect(api.nextRefreshBatch).not.toHaveBeenCalled(); // the run was already done
});

test("a run where every record was verified says so", async () => {
  api.getRefreshRun.mockResolvedValue(run({ verified: 50, unverified_count: 0, unverified: [] }));
  render(<RefreshResultsPage runId="12" />);

  expect(await screen.findByRole("heading", { name: "Every record was verified" })).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test("a run that didn't finish says how far it got", async () => {
  api.getRefreshRun.mockResolvedValue(run({ done: false, processed: 20, finished_at: null }));
  render(<RefreshResultsPage runId="12" />);

  expect(await screen.findByText(/This refresh hasn’t finished: 20 of 50 records were processed/)).toBeInTheDocument();
});

test("latest opens the most recent run, and earlier runs are linked", async () => {
  render(<RefreshResultsPage runId="latest" />);

  expect(await screen.findByRole("heading", { name: "Refresh #12" })).toBeInTheDocument();
  expect(api.getRefreshRun).toHaveBeenCalledWith("12");
  expect(screen.getByRole("link", { name: "View results" })).toHaveAttribute("href", "#/refresh/11");
});

test("latest with no refreshes yet points to the Refresh page", async () => {
  api.listRefreshRuns.mockResolvedValue([]);
  render(<RefreshResultsPage runId="latest" />);

  expect(await screen.findByRole("heading", { name: "No refreshes yet" })).toBeInTheDocument();
  expect(api.getRefreshRun).not.toHaveBeenCalled();
});

test("shows the API's error when the run can't be loaded", async () => {
  api.getRefreshRun.mockRejectedValue(new Error("Refresh run not found"));
  render(<RefreshResultsPage runId="999" />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Refresh run not found");
});
