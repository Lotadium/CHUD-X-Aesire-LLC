import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ContactEditForm from "./ContactEditForm";

test("pre-fills the form with the existing contact", async () => {
  render(<ContactEditForm id="1" />);
  expect(await screen.findByDisplayValue("Dana")).toBeInTheDocument();
  expect(screen.getByLabelText(/Last Name/)).toHaveValue("Lopez");
  expect(screen.getByLabelText(/^Entity/)).toHaveValue("1");
  expect(screen.getByLabelText(/^Email/)).toHaveValue("dlopez@metrofire.ca.gov");
});

test("shows an inline error for a bad phone number", async () => {
  const user = userEvent.setup();
  render(<ContactEditForm id="1" />);
  const phone = await screen.findByLabelText(/^Phone/);
  await user.clear(phone);
  await user.type(phone, "430-8125");
  await user.tab();
  expect(screen.getByText(/10-digit phone number/)).toBeInTheDocument();
});

test("saves changes through the API", async () => {
  const user = userEvent.setup();
  render(<ContactEditForm id="1" />);
  const title = await screen.findByLabelText(/^Title/);
  await user.clear(title);
  await user.type(title, "Clerk of the Board");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByText("Changes saved")).toBeInTheDocument();
  const { getContact } = await import("../lib/api");
  expect((await getContact("1")).title).toBe("Clerk of the Board");
});

// ---------- Flag instead of delete (charter 2.3 f.iv) ----------

test("there is no delete button", async () => {
  render(<ContactEditForm id="1" />);
  await screen.findByDisplayValue("Dana");
  expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
});

test("flagging asks for confirmation, and Cancel leaves the contact unflagged", async () => {
  const user = userEvent.setup();
  render(<ContactEditForm id="1" />);
  await user.click(await screen.findByRole("button", { name: "Flag as no longer valid" }));
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  const { getContact } = await import("../lib/api");
  expect((await getContact("1")).flagged).toBe(false);
});

test("confirming flags the contact and keeps the record", async () => {
  const user = userEvent.setup();
  render(<ContactEditForm id="1" />);
  await user.click(await screen.findByRole("button", { name: "Flag as no longer valid" }));
  await user.type(screen.getByLabelText(/Reason/), "Retired");
  await user.click(screen.getByRole("button", { name: "Flag record" }));
  expect(await screen.findByText("Flagged as no longer valid", { selector: "p" })).toBeInTheDocument();
  const { getContact } = await import("../lib/api");
  expect((await getContact("1")).flagged).toBe(true); // still in the database
});
