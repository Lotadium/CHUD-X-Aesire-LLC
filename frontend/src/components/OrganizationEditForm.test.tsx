import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrganizationEditForm from "./OrganizationEditForm";

test("pre-fills the form with the existing organization", async () => {
  render(<OrganizationEditForm id="1" />);
  expect(await screen.findByDisplayValue("Sacramento Metro Fire")).toBeInTheDocument();
  expect(screen.getByLabelText(/Domain/)).toHaveValue("1");
  expect(screen.getByLabelText(/Website/)).toHaveValue("https://metrofire.ca.gov/");
});

test("shows an inline error when the name is cleared and the user leaves the field", async () => {
  const user = userEvent.setup();
  render(<OrganizationEditForm id="1" />);
  const name = await screen.findByDisplayValue("Sacramento Metro Fire");
  await user.clear(name);
  await user.tab(); // leave the field
  expect(screen.getByText(/name is required/)).toBeInTheDocument();
});

test("shows an inline error for a bad website when saving", async () => {
  const user = userEvent.setup();
  render(<OrganizationEditForm id="1" />);
  const website = await screen.findByLabelText(/Website/);
  await user.clear(website);
  await user.type(website, "hello");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.getByText(/Enter a website/)).toBeInTheDocument();
});

test("saves changes through the API", async () => {
  const user = userEvent.setup();
  render(<OrganizationEditForm id="1" />);
  const name = await screen.findByLabelText(/Entity Name/);
  await user.clear(name);
  await user.type(name, "Metro Fire District");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByText("Changes saved")).toBeInTheDocument();
  const { getOrganization } = await import("../lib/api");
  expect((await getOrganization("1")).name).toBe("Metro Fire District");
});

test("delete asks for confirmation, and Cancel keeps the record", async () => {
  const user = userEvent.setup();
  render(<OrganizationEditForm id="1" />);
  await user.click(await screen.findByRole("button", { name: "Delete entity" }));
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  const { getOrganization } = await import("../lib/api");
  await expect(getOrganization("1")).resolves.toBeTruthy();
});

test("confirming the dialog deletes the record", async () => {
  const user = userEvent.setup();
  render(<OrganizationEditForm id="1" />);
  await user.click(await screen.findByRole("button", { name: "Delete entity" }));
  await user.click(screen.getByRole("button", { name: "Delete" }));
  expect(await screen.findByText("Entity deleted.")).toBeInTheDocument();
  const { getOrganization } = await import("../lib/api");
  await expect(getOrganization("1")).rejects.toThrow("not found");
});

test("the delete dialog names the saved entity even if the name box was cleared", async () => {
  const user = userEvent.setup();
  render(<OrganizationEditForm id="2" />);
  const name = await screen.findByLabelText(/Entity Name/);
  await user.clear(name);
  await user.click(screen.getByRole("button", { name: "Delete entity" }));
  expect(screen.getByRole("heading", { name: "Delete Folsom Water District?" })).toBeInTheDocument();
});
