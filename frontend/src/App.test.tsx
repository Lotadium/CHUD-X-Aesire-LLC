// Written with help from Claude Code (Opus 5.5) (AI assistant). Reviewed and tested by Ryan Griffiths. See frontend/README.md → "AI assistance".
//
// (CHUD-54): Tests for moving between screens. 
// The server is faked with a stubbed fetch and the fake API.
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";

// Menu item, its address, and the title of the screen it opens
const items = [
  ["Records", "#/records", "Entities & contacts"],
  ["Search", "#/search", "Search"],
  ["Review", "#/review", "Review"],
  ["Refresh", "#/refresh", "Refresh"],
  ["Activity log", "#/activity", "Activity log"],
];

const nav = () => screen.getByRole("navigation", { name: "Main" });
const title = (name: string) => screen.findByRole("heading", { level: 1, name });

function expectCurrent(label: string) {
  const current = within(nav()).getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
  expect(current.map((link) => link.textContent)).toEqual([label]);
}

beforeEach(() => {
  window.location.hash = "";
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ data: [], total: 0, used: 0, limit: null })))));
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = "";
});

test("the menu links to every screen's own address", () => {
  render(<App />);
  const links = within(nav()).getAllByRole("link");
  expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual(items.map(([label, href]) => [label, href]));
});

test("clicking a menu item opens its screen, changes the address and moves the highlight", async () => {
  const user = userEvent.setup();
  render(<App />);
  // Ends back on Records, so every item is clicked from another screen
  for (const [label, href, heading] of [...items.slice(1), items[0]]) {
    await user.click(within(nav()).getByRole("link", { name: label }));
    expect(await title(heading)).toBeInTheDocument();
    expect(window.location.hash).toBe(href);
    expectCurrent(label);
  }
});

test("the browser's back and forward buttons move between screens", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(within(nav()).getByRole("link", { name: "Refresh" }));
  await title("Refresh");
  await user.click(within(nav()).getByRole("link", { name: "Activity log" }));
  await title("Activity log");

  act(() => window.history.back());
  expect(await title("Refresh")).toBeInTheDocument();
  expectCurrent("Refresh");

  act(() => window.history.forward());
  expect(await title("Activity log")).toBeInTheDocument();
  expectCurrent("Activity log");
});

test.each(items)("%s opens directly from its address", async (label, href, heading) => {
  window.location.hash = href;
  render(<App />);
  expect(await title(heading)).toBeInTheDocument();
  expectCurrent(label);
});

test.each([
  ["#/records/2", "Folsom Water District", "Records"],
  ["#/entity/1", "Edit Entity", "Records"],
  ["#/contact/1", "Edit Contact", "Records"],
  ["#/review/website/3", "Review", "Review"],
])("%s opens its screen and highlights the menu item it belongs to", async (href, heading, label) => {
  window.location.hash = href;
  render(<App />);
  expect(await title(heading)).toBeInTheDocument();
  expectCurrent(label);
});

test("another record's address loads that record", async () => {
  window.location.hash = "#/records/1";
  render(<App />);
  await title("Sacramento Metro Fire");
  act(() => {
    window.location.hash = "#/records/2";
  });
  expect(await title("Folsom Water District")).toBeInTheDocument();
});

test.each(["", "#/", "#/nothing-here", "#/records/1/extra"])("the address %j shows Records", async (href) => {
  window.location.hash = href;
  render(<App />);
  expect(await title("Entities & contacts")).toBeInTheDocument();
  expectCurrent("Records");
});
