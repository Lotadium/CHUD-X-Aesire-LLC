// AI use: written with help from Claude (Anthropic).
// The Refresh tab in the black top bar opens the Refresh page and is highlighted there (CHUD-56).
import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import AppShell from "./AppShell";

test("the Refresh tab links to the Refresh page", () => {
  render(<AppShell>page</AppShell>);
  const nav = screen.getByRole("navigation", { name: "Main" });
  expect(within(nav).getByRole("link", { name: "Refresh" })).toHaveAttribute("href", "#/refresh");
  expect(within(nav).getByRole("link", { name: "Refresh" })).not.toHaveAttribute("aria-current");
});

test("the active tab is marked as the current page", () => {
  render(<AppShell active="Refresh">page</AppShell>);
  const nav = screen.getByRole("navigation", { name: "Main" });
  expect(within(nav).getByRole("link", { name: "Refresh" })).toHaveAttribute("aria-current", "page");
  expect(within(nav).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
});
