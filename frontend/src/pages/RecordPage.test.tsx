// Written with help from Claude Code (Sonnet 5.5) (AI assistant). Reviewed and tested by Irene Riva. See frontend/README.md → "AI assistance".
// Tests for the record page (CHUD-64). They use the fake API (sample data), never the real backend.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";
import App from "../App";
import RecordPage from "./RecordPage";

afterEach(() => {
  window.location.hash = "";
});

test("shows a loading message, then the organization, its website and its verified status", async () => {
  render(<RecordPage id="1" />);
  expect(screen.getByText("Loading record…")).toBeInTheDocument();
  expect(await screen.findByRole("heading", { name: "Sacramento Metro Fire" })).toBeInTheDocument();
  expect(screen.getByText("Fire")).toBeInTheDocument(); // domain
  expect(screen.getByRole("link", { name: /metrofire\.ca\.gov/ })).toBeInTheDocument();
  expect(screen.getByText(/^Verified /)).toBeInTheDocument();
});

test("lists the organization's contacts with name, title, email and phone", async () => {
  render(<RecordPage id="1" />);
  const row = (await screen.findByRole("link", { name: "Dana Lopez" })).closest("tr")!;
  expect(within(row).getByText("Board Clerk")).toBeInTheDocument();
  expect(within(row).getByText("dlopez@metrofire.ca.gov")).toBeInTheDocument();
  expect(within(row).getByText("(916) 859-4300 ext. 12")).toBeInTheDocument();
  expect(screen.queryByText("Marcus Reed")).not.toBeInTheDocument(); // works for another organization
});

test("shows Not Found for a blank value and for an organization without a website", async () => {
  render(<RecordPage id="2" />);
  const row = (await screen.findByRole("link", { name: "Marcus Reed" })).closest("tr")!;
  expect(within(row).getByText("Not Found")).toBeInTheDocument(); // no email on file
  expect(screen.getByText("No website yet")).toBeInTheDocument();
});

test("has an Edit link to the entity form and a place for the history panel", async () => {
  render(<RecordPage id="1" />);
  expect(await screen.findByRole("link", { name: "Edit" })).toHaveAttribute("href", "#/entity/1");
  expect(screen.getByRole("heading", { name: "Record history" })).toBeInTheDocument();
});

test("links each contact to the contact form", async () => {
  render(<RecordPage id="1" />);
  expect(await screen.findByRole("link", { name: "Dana Lopez" })).toHaveAttribute("href", "#/contact/1");
});

test("shows an error when the record does not exist", async () => {
  render(<RecordPage id="999" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Organization not found.");
});

test("refreshes the record and shows the result", async () => {
  const user = userEvent.setup();
  render(<RecordPage id="1" />);
  const button = await screen.findByRole("button", { name: "Refresh" });
  await user.click(button);
  expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();
  expect(await screen.findByText(/^Refreshed:/, undefined, { timeout: 5000 })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
});

test("is reachable from the app at #/records/<id>", async () => {
  window.location.hash = "#/records/2";
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Folsom Water District" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Record page" })).toHaveAttribute("aria-current", "page");
});

// CHUD-57: the history panel fills the Record history card. Added with help from Claude Code (Opus 5.5) (AI assistant). Reviewed and tested by Rachel.
test("shows the record history panel with the record's versions", async () => {
  render(<RecordPage id="2" />);
  expect(await screen.findByText("No earlier versions")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open activity log for this record" })).toHaveAttribute("href", "#/activity/2");
});
