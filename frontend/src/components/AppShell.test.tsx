// Written with help from Claude Code (Opus 5.5) (AI assistant). Reviewed and tested by Ryan Griffiths. See frontend/README.md → "AI assistance".
//
// (CHUD-54): The active menu item in the black top bar
import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import AppShell from "./AppShell";

test("marks only the active menu item as the current page", () => {
  render(<AppShell active="Refresh">page</AppShell>);
  const nav = screen.getByRole("navigation", { name: "Main" });
  const current = within(nav).getAllByRole("link").filter((link) => link.hasAttribute("aria-current"));
  expect(current).toHaveLength(1);
  expect(current[0]).toHaveTextContent("Refresh");
  expect(current[0]).toHaveAttribute("aria-current", "page");
});

test("marks nothing when no screen is active, and still shows the page", () => {
  render(<AppShell>page</AppShell>);
  for (const link of screen.getAllByRole("link")) expect(link).not.toHaveAttribute("aria-current");
  expect(screen.getByText("page")).toBeInTheDocument();
});
