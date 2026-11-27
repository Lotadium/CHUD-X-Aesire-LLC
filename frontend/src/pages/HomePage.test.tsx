// Written with help from Claude Code (Sonnet 5.5) (AI assistant). Reviewed and tested by Irene Riva. See frontend/README.md → "AI assistance".
// Tests for the Home page (CHUD-66).
import { render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import App from "../App";
import HomePage from "./HomePage";

afterEach(() => {
  window.location.hash = "";
});

test("shows the title and a card for each action", () => {
  render(<HomePage />);
  expect(screen.getByRole("heading", { name: "Client Tracking App" })).toBeInTheDocument();
  expect(screen.getByText("Choose an action to get started.")).toBeInTheDocument();
  expect(screen.getByText("Verify and update existing records against their current sources.")).toBeInTheDocument();
  expect(screen.getByText("Add a new entity by searching its name or website.")).toBeInTheDocument();
  expect(screen.getByText("View updated, recent, and unresolved record summaries.")).toBeInTheDocument();
});

test("the Refresh card opens the Refresh page", () => {
  render(<HomePage />);
  expect(screen.getByRole("link", { name: "Open Refresh" })).toHaveAttribute("href", "#/refresh");
});

test("cards that are not built yet say Coming soon instead of linking anywhere", () => {
  render(<HomePage />);
  expect(screen.queryByRole("link", { name: "Open New Record" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Open Reports" })).not.toBeInTheDocument();
  for (const title of ["New Record", "Reports"]) {
    const card = screen.getByRole("group", { name: `${title} (coming soon)` });
    expect(within(card).getByText("Coming soon")).toBeInTheDocument();
  }
});

test("opening the app shows the Home page, with Home marked in the top bar", () => {
  window.location.hash = "";
  render(<App />);
  expect(screen.getByRole("heading", { name: "Client Tracking App" })).toBeInTheDocument();
  const nav = screen.getByRole("navigation", { name: "Main" });
  expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("href", "#/home");
  expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
});

test("#/home shows the Home page, and #/records still opens the records list", () => {
  window.location.hash = "#/home";
  const { unmount } = render(<App />);
  expect(screen.getByRole("heading", { name: "Client Tracking App" })).toBeInTheDocument();
  unmount();

  window.location.hash = "#/records";
  render(<App />);
  expect(screen.queryByText("Choose an action to get started.")).not.toBeInTheDocument();
});
