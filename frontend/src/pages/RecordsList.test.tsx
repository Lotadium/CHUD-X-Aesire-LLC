// AI use: written with help from Claude (Anthropic).
// Tests for the "Find website" action on the records list page (CHUD-49).
// The server is faked with a stubbed fetch, using made-up records.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import RecordsList from "./RecordsList";

const orgs = [
  { organization_id: 1, name: "Test Fire District", website_url: null, domain_name: "Fire" },
  { organization_id: 2, name: "Sample Water Agency", website_url: null, domain_name: "Water" },
];

let used = 4;
let finishSearch: (() => void) | null = null;
let findCalls: number[] = [];
const results: Record<number, object> = {
  1: { result: "saved", website_url: "https://testfire.example" },
  2: { result: "needs_review", website_url: "https://maybe-water.example" },
};

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

beforeEach(() => {
  used = 4;
  findCalls = [];
  finishSearch = null;
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (url.endsWith("/organizations?limit=200")) return json({ data: orgs });
    if (url.endsWith("/people?limit=200")) return json({ data: [] });
    if (url.endsWith("/search-usage")) return json({ month: "2026-10", used, limit: 500 });
    const m = url.match(/\/organizations\/(\d+)\/find-website$/);
    if (m) {
      const id = Number(m[1]);
      findCalls.push(id);
      return new Promise<Response>((resolve) => {
        finishSearch = () => {
          used += 1;
          resolve(new Response(JSON.stringify({ ...results[id], usage: { used, limit: 500 } }), { status: 200 }));
        };
      });
    }
    return Promise.resolve(new Response("{}", { status: 404 }));
  }));
});

afterEach(() => vi.unstubAllGlobals());

test("shows this month's search usage", async () => {
  render(<RecordsList />);
  expect(await screen.findByText("4 of 500")).toBeInTheDocument();
});

test("searches one entity, shows loading, blocks double clicks, then shows the saved URL", async () => {
  const user = userEvent.setup();
  render(<RecordsList />);
  const button = await screen.findByRole("button", { name: "Find website for Test Fire District" });

  await user.click(button);
  expect(button).toBeDisabled();
  expect(screen.getByText("Searching…")).toBeInTheDocument();
  await user.click(button); // ignored while running
  expect(findCalls).toEqual([1]);

  finishSearch!();
  expect(await screen.findByText("URL saved")).toBeInTheDocument();
  expect(screen.getByText("https://testfire.example")).toBeInTheDocument();
  expect(screen.getByText("5 of 500")).toBeInTheDocument();
  expect(button).toBeEnabled();
});

test("bulk action searches selected entities and links 'needs review' to the review screen", async () => {
  const user = userEvent.setup();
  render(<RecordsList />);
  await user.click(await screen.findByRole("checkbox", { name: "Select Sample Water Agency" }));
  await user.click(screen.getByRole("button", { name: "Find website for selected (1)" }));
  expect(findCalls).toEqual([2]);

  finishSearch!();
  const link = await screen.findByRole("link", { name: "Needs review" });
  expect(link).toHaveAttribute("href", "#/review/website/2");
  const row = link.closest("tr")!;
  expect(within(row).getByText("Sample Water Agency")).toBeInTheDocument();
});
