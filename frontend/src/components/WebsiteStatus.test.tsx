import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import WebsiteStatus, { displayUrl, formatDate, toHref } from "./WebsiteStatus";

test("shows the website as a link that opens in a new tab", () => {
  render(<WebsiteStatus url="https://metrofire.ca.gov/" source="auto" updatedAt="2026-10-20T19:00:00Z" />);
  const link = screen.getByRole("link", { name: /metrofire\.ca\.gov/ });
  expect(link).toHaveAttribute("href", "https://metrofire.ca.gov/");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer"); // the new tab can't control our page
  expect(link).toHaveAccessibleName(/opens in a new tab/); // screen readers are told
});

test("says where the website came from and when it was updated", () => {
  const { rerender } = render(<WebsiteStatus url="https://metrofire.ca.gov/" source="auto" updatedAt="2026-10-20T19:00:00Z" />);
  expect(screen.getByText("Found automatically")).toBeInTheDocument();
  expect(screen.getByText("Updated Oct 20, 2026")).toBeInTheDocument();
  rerender(<WebsiteStatus url="https://metrofire.ca.gov/" source="manual" updatedAt="2026-10-20T19:00:00Z" />);
  expect(screen.getByText("Entered manually")).toBeInTheDocument();
});

test("shows 'No website yet' and no link when there is no website", () => {
  render(<WebsiteStatus url="" source="" updatedAt="" />);
  expect(screen.getByText("No website yet")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

test("leaves out the badge and date when they are unknown", () => {
  render(<WebsiteStatus url="https://metrofire.ca.gov/" source="" updatedAt="" />);
  expect(screen.queryByText(/Found automatically|Entered manually/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
});

test("helpers: link always uses http(s), display drops the scheme, bad dates are blank", () => {
  expect(toHref("metrofire.ca.gov")).toBe("https://metrofire.ca.gov");
  expect(toHref("http://old.example.org")).toBe("http://old.example.org");
  expect(displayUrl("https://www.metrofire.ca.gov/")).toBe("www.metrofire.ca.gov");
  expect(formatDate("not a date")).toBe("");
  expect(formatDate("")).toBe("");
});
