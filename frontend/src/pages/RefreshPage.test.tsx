// AI use: written with help from Claude (Anthropic).
// Tests for the Refresh page (CHUD-33). The refresh API is replaced with a fake that the
// test steps through one batch at a time, so we can check the page in the middle of a run.
import { StrictMode } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import type { RefreshProgress, UnverifiedRecord } from "../lib/refreshApi";

const api = vi.hoisted(() => ({ startRefresh: vi.fn(), nextRefreshBatch: vi.fn() }));
vi.mock("../lib/refreshApi", () => api);

import RefreshPage from "./RefreshPage";

const progress = (processed: number, total: number, unverified: UnverifiedRecord[] = []): RefreshProgress => ({
  run_id: "run-1",
  total,
  processed,
  verified: processed - unverified.length,
  updated: 0,
  unverified,
  done: processed === total,
});

// Each call to nextRefreshBatch waits until the test calls step() with the result to return
let pending: { resolve: (p: RefreshProgress) => void; reject: (e: Error) => void } | null;
const step = (p: RefreshProgress) => { pending!.resolve(p); pending = null; };
const fail = (message: string) => { pending!.reject(new Error(message)); pending = null; };

beforeEach(() => {
  pending = null;
  api.startRefresh.mockReset().mockResolvedValue(progress(0, 50));
  api.nextRefreshBatch.mockReset().mockImplementation(
    () => new Promise((resolve, reject) => { pending = { resolve, reject }; }),
  );
});

const failures: UnverifiedRecord[] = [
  { organization_id: 1, name: "Hartley Water District", reason: "website not found", detail: "website not found", reason_code: "X" },
  { organization_id: 2, name: "Valley Mosquito Abatement", reason: "website not found", detail: "website not found", reason_code: "X" },
  { organization_id: 3, name: "Station 12 (General Line)", reason: "no contact name listed", detail: "no contact name listed", reason_code: "X" },
  { organization_id: 4, name: "Delta Resource Conservation", reason: "site unreachable", detail: "site unreachable", reason_code: "X" },
  { organization_id: 5, name: "Rio Linda Fire", reason: "contact not found", detail: "contact not found", reason_code: "X" },
  { organization_id: 6, name: "Sutter Cemetery District", reason: "site unreachable", detail: "site unreachable", reason_code: "X" },
  { organization_id: 7, name: "Oak Park Recreation", reason: "website not found", detail: "website not found", reason_code: "X" },
];

test("shows progress while running, greys out the form, and blocks a second start", async () => {
  const user = userEvent.setup();
  // StrictMode like main.tsx: it mounts the page twice in development, which once left the run stuck on "Starting"
  render(<StrictMode><RefreshPage /></StrictMode>);
  await user.click(screen.getByRole("button", { name: "Refresh" }));

  expect(await screen.findByText("Refreshing your records…")).toBeInTheDocument();
  expect(screen.getByText("Please keep this page open until the refresh finishes.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Search + Update" })).toBeDisabled();
  expect(screen.getByLabelText("Domain")).toBeDisabled();

  step(progress(22, 50));
  expect(await screen.findByText("22 of 50 records processed")).toBeInTheDocument();
  expect(screen.getByText("44%")).toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "22");
  expect(api.startRefresh).toHaveBeenCalledTimes(1);
});

test("all verified: shows the green pop-up, and Done leaves a 'Refresh complete' card", async () => {
  const user = userEvent.setup();
  render(<RefreshPage />);
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText("Refreshing your records…");
  step(progress(50, 50));

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("All 50 records verified")).toBeInTheDocument();
  expect(within(dialog).getByText(/^50 of 50 records were verified\. 0 records/)).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Done" })).toHaveFocus();

  await user.click(within(dialog).getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("Refresh complete")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Search + Update" })).toBeEnabled();
});

test("some failed: lists the first 5 with reasons and '+ 2 more', then Review records shows them", async () => {
  const user = userEvent.setup();
  render(<RefreshPage />);
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText("Refreshing your records…");
  step(progress(50, 50, failures));

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("7 records couldn’t be verified")).toBeInTheDocument();
  expect(within(dialog).getByText(/^43 of 50 records were verified\. These 7/)).toBeInTheDocument();
  expect(within(dialog).getByText("Hartley Water District — website not found")).toBeInTheDocument();
  expect(within(dialog).getByText("Rio Linda Fire — contact not found")).toBeInTheDocument();
  expect(within(dialog).queryByText(/Sutter Cemetery District/)).not.toBeInTheDocument();
  expect(within(dialog).getByText("+ 2 more")).toBeInTheDocument();

  await user.click(within(dialog).getByRole("button", { name: "Review records" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("7 records need attention")).toBeInTheDocument();
});

test("a failed batch shows an error instead of a stuck bar, and Continue picks up the same run", async () => {
  const user = userEvent.setup();
  render(<RefreshPage />);
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  await screen.findByText("Refreshing your records…");
  step(progress(20, 50));
  await screen.findByText("20 of 50 records processed");
  fail("Can't reach the server. Check that the API is running.");

  expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the server");
  expect(screen.getByText(/20 of 50 records were processed before it stopped/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Continue refresh" }));
  expect(api.startRefresh).toHaveBeenCalledTimes(1); // not restarted
  expect(api.nextRefreshBatch).toHaveBeenLastCalledWith("run-1");
  step(progress(50, 50));
  expect(await screen.findByText("All 50 records verified")).toBeInTheDocument();
});

test("if the refresh can't start, offers Try again", async () => {
  api.startRefresh.mockRejectedValueOnce(new Error("Request failed (500)."));
  const user = userEvent.setup();
  render(<RefreshPage />);
  await user.click(screen.getByRole("button", { name: "Refresh" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Request failed (500).");
  expect(screen.getByText("The refresh couldn’t start.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Refreshing your records…")).toBeInTheDocument();
});

test("shows how many records got new details, and handles a run with no records", async () => {
  api.startRefresh.mockResolvedValueOnce({ ...progress(0, 0), done: true });
  const user = userEvent.setup();
  render(<RefreshPage />);
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByText("No records to refresh")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Done" }));

  await user.click(screen.getByRole("button", { name: "Refresh again" }));
  await screen.findByText("Refreshing your records…");
  step({ ...progress(50, 50), updated: 5 });
  expect(await screen.findByText(/50 of 50 records were verified, 5 with new details saved/)).toBeInTheDocument();
});
