import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import type { ContactSearchResult } from "../lib/api";
import SearchPage from "./SearchPage";

const { searchContacts } = vi.hoisted(() => ({ searchContacts: vi.fn() }));

vi.mock("../lib/api", () => ({ searchContacts }));

const results: ContactSearchResult[] = [
  {
    id: "1", firstName: "Dana", middleName: "", lastName: "Lopez", organizationId: "1",
    title: "Board Clerk", phone: "(916) 859-4300", phoneExt: "12", mobilePhone: "",
    email: "dlopez@metrofire.ca.gov", flagged: false, flagReason: "",
    organizationName: "Sacramento Metro Fire", fieldOfWork: "Fire",
  },
  {
    id: "2", firstName: "Marcus", middleName: "J", lastName: "Reed", organizationId: "2",
    title: "General Manager", phone: "(916) 555-0142", phoneExt: "", mobilePhone: "",
    email: "marcus@example.org", flagged: false, flagReason: "",
    organizationName: "Folsom Water District", fieldOfWork: "Water",
  },
];

beforeEach(() => {
  searchContacts.mockReset();
});

test("loads search results with complete contact information", async () => {
  const user = userEvent.setup();
  searchContacts.mockResolvedValueOnce(results).mockResolvedValueOnce([results[0]]);
  render(<SearchPage />);

  await screen.findByRole("link", { name: "Dana Lopez" });
  await user.type(screen.getByLabelText("Search"), "Dana");
  await user.click(screen.getByRole("button", { name: "Search", exact: true }));

  expect(await screen.findByRole("link", { name: "Dana Lopez" })).toHaveAttribute("href", "#/records/1");
  expect(screen.queryByRole("link", { name: "Marcus J Reed" })).not.toBeInTheDocument();
  expect(searchContacts).toHaveBeenLastCalledWith({ query: "Dana", title: "", fieldOfWork: "", organization: "" });
  expect(screen.getAllByText("Board Clerk").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Sacramento Metro Fire").length).toBeGreaterThan(0);
  expect(screen.getByText("dlopez@metrofire.ca.gov")).toBeInTheDocument();
  expect(screen.getByText("(916) 859-4300")).toBeInTheDocument();
});

test("applies a job title filter and clears it", async () => {
  const user = userEvent.setup();
  searchContacts
    .mockResolvedValueOnce(results)
    .mockResolvedValueOnce([results[1]])
    .mockResolvedValueOnce(results);
  render(<SearchPage />);

  await screen.findByRole("link", { name: "Dana Lopez" });
  await user.selectOptions(screen.getByRole("combobox", { name: "Job title" }), "General Manager");
  await user.click(screen.getByRole("button", { name: "Search", exact: true }));

  await waitFor(() => expect(screen.queryByRole("link", { name: "Dana Lopez" })).not.toBeInTheDocument());
  expect(screen.getByRole("link", { name: "Marcus J Reed" })).toBeInTheDocument();
  expect(searchContacts).toHaveBeenLastCalledWith({
    query: "",
    title: "General Manager",
    fieldOfWork: "",
    organization: "",
  });

  await user.click(screen.getByRole("button", { name: "Clear filters" }));
  await waitFor(() => expect(screen.getByRole("link", { name: "Dana Lopez" })).toBeInTheDocument());
  expect(searchContacts).toHaveBeenLastCalledWith({
    query: "",
    title: "",
    fieldOfWork: "",
    organization: "",
  });
});

test("shows no match found after an empty search result", async () => {
  const user = userEvent.setup();
  searchContacts.mockResolvedValueOnce(results).mockResolvedValueOnce([]);
  render(<SearchPage />);

  await screen.findByRole("link", { name: "Dana Lopez" });
  await user.type(screen.getByLabelText("Search"), "does not exist");
  await user.click(screen.getByRole("button", { name: "Search", exact: true }));

  expect(await screen.findByText("No match found")).toBeInTheDocument();
  expect(screen.getByText("Try clearing the filters or changing your search.")).toBeInTheDocument();
});

test("shows an error instead of no match found when searching fails", async () => {
  searchContacts.mockRejectedValueOnce(new Error("Server unavailable"));
  render(<SearchPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Server unavailable");
  expect(screen.queryByText("No match found")).not.toBeInTheDocument();
});
