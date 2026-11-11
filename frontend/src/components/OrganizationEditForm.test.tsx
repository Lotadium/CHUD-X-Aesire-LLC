import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrganizationEditForm from "./OrganizationEditForm";
import { toHref } from "../lib/website";

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

// ---------- Flag instead of delete (charter 2.3 f.iv) ----------

test("there is no delete button", async () => {
  render(<OrganizationEditForm id="1" />);
  await screen.findByLabelText(/Entity Name/);
  expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
});

test("flagging asks for confirmation, and Cancel leaves the record unflagged", async () => {
  const user = userEvent.setup();
  render(<OrganizationEditForm id="1" />);
  await user.click(await screen.findByRole("button", { name: "Flag as no longer valid" }));
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  const { getOrganization } = await import("../lib/api");
  expect((await getOrganization("1")).flagged).toBe(false);
});

test("confirming flags the record, keeps it, and it can be unflagged", async () => {
  const user = userEvent.setup();
  render(<OrganizationEditForm id="1" />);
  await user.click(await screen.findByRole("button", { name: "Flag as no longer valid" }));
  await user.type(screen.getByLabelText(/Reason/), "District merged");
  await user.click(screen.getByRole("button", { name: "Flag record" }));
  expect(await screen.findByText("Reason: District merged", { exact: false })).toBeInTheDocument();
  const { getOrganization } = await import("../lib/api");
  const org = await getOrganization("1");
  expect(org.flagged).toBe(true); // still in the database, just flagged
  await user.click(screen.getByRole("button", { name: "Remove flag" }));
  expect(await screen.findByText("Flag removed")).toBeInTheDocument();
  expect((await getOrganization("1")).flagged).toBe(false);
});

test("the flag dialog names the saved entity even if the name box was cleared", async () => {
  const user = userEvent.setup();
  render(<OrganizationEditForm id="2" />);
  const name = await screen.findByLabelText(/Entity Name/);
  await user.clear(name);
  await user.click(screen.getByRole("button", { name: "Flag as no longer valid" }));
  expect(screen.getByRole("heading", { name: /Flag Folsom Water District/ })).toBeInTheDocument();
});

test("Flag record stays disabled until a reason is entered", async () => {
  const user = userEvent.setup();
  render(<OrganizationEditForm id="2" />);
  await user.click(await screen.findByRole("button", { name: "Flag as no longer valid" }));
  expect(screen.getByRole("button", { name: "Flag record" })).toBeDisabled();
  await user.type(screen.getByLabelText(/Reason/), "Closed");
  expect(screen.getByRole("button", { name: "Flag record" })).toBeEnabled();
});

// ---------- Website on the entity page (CHUD-31) ----------

test("shows the saved website as a link, where it came from, and when it was updated", async () => {
  render(<OrganizationEditForm id="1" />);
  const link = await screen.findByRole("link", { name: /metrofire\.ca\.gov/ });
  expect(link).toHaveAttribute("href", "https://metrofire.ca.gov/");
  expect(link).toHaveAttribute("target", "_blank");
  expect(screen.getByText("Found automatically")).toBeInTheDocument();
  expect(screen.getByText("Updated Oct 20, 2026")).toBeInTheDocument();
});

test("an entity with no website says 'No website yet'", async () => {
  render(<OrganizationEditForm id="2" />);
  expect(await screen.findByText("No website yet")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

test("the link only changes after saving, then shows 'Entered manually'; clearing removes it", async () => {
  const user = userEvent.setup();
  render(<OrganizationEditForm id="2" />);
  const website = await screen.findByLabelText(/Website/);
  await user.type(website, "https://folsomwater.ca.gov");
  expect(screen.getByText("No website yet")).toBeInTheDocument(); // typing alone doesn't change what's on file

  await user.click(screen.getByRole("button", { name: "Save changes" }));
  const link = await screen.findByRole("link", { name: /folsomwater\.ca\.gov/ });
  expect(link).toHaveAttribute("href", "https://folsomwater.ca.gov");
  expect(screen.getByText("Entered manually")).toBeInTheDocument();
  expect(screen.getByText(/^Updated /)).toBeInTheDocument();

  // Removing a saved website asks first (Irene's CHUD-30 rule), then shows "No website yet"
  await user.clear(website);
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.getByRole("heading", { name: "Remove the website on file?" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Remove website" }));
  expect(await screen.findByText("No website yet")).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

test("replacing a saved website asks first; Cancel keeps the old one", async () => {
  const user = userEvent.setup();
  render(<OrganizationEditForm id="1" />);
  const website = await screen.findByLabelText(/Website/);
  await user.clear(website);
  await user.type(website, "www.metrofire.org");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  expect(screen.getByRole("heading", { name: "Replace the website on file?" })).toBeInTheDocument();
  expect(screen.getByText(/metrofire\.ca\.gov will be replaced with www\.metrofire\.org/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /metrofire\.ca\.gov/ })).toBeInTheDocument();
  const { getOrganization } = await import("../lib/api");
  expect((await getOrganization("1")).websiteUrl).toBe("https://metrofire.ca.gov/"); // not saved

  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await user.click(screen.getByRole("button", { name: "Replace website" }));
  expect(await screen.findByRole("link", { name: /www\.metrofire\.org/ })).toBeInTheDocument();
  expect(screen.getByText("Entered manually")).toBeInTheDocument();
});

test("saving without touching the website doesn't ask about it", async () => {
  const user = userEvent.setup();
  render(<OrganizationEditForm id="2" />);
  await screen.findByLabelText(/Entity Name/);
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByText("Changes saved")).toBeInTheDocument();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});

test("a bad website is not saved, and the link stays the same", async () => {
  const user = userEvent.setup();
  const { getOrganization } = await import("../lib/api");
  const before = (await getOrganization("1")).websiteUrl; // whatever earlier tests left saved
  render(<OrganizationEditForm id="1" />);
  const website = await screen.findByLabelText(/Website/);
  await user.clear(website);
  await user.type(website, "not a site");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.getByText(/Enter a website/)).toBeInTheDocument();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); // invalid input never gets as far as "Replace?"
  expect(screen.getByRole("link")).toHaveAttribute("href", toHref(before)); // the link adds https:// when missing
  expect((await getOrganization("1")).websiteUrl).toBe(before);
});

// ---------- System dates (CHUD-36, charter 2.3 g.i and g.iv) ----------

test("shows when the entity was created, last updated and last verified", async () => {
  render(<OrganizationEditForm id="1" />);
  const dates = await screen.findByTestId("record-dates");
  expect(dates).toHaveTextContent(/Created Oct 5, 2026/);
  expect(dates).toHaveTextContent(/Last updated \w{3} \d{1,2}, \d{4}/);
  expect(dates).toHaveTextContent(/Last verified \w{3} \d{1,2}, \d{4}/);
});

test("saving without changes moves last verified but not last updated", async () => {
  const user = userEvent.setup();
  const { getOrganization } = await import("../lib/api");
  const before = await getOrganization("1");
  render(<OrganizationEditForm id="1" />);
  await screen.findByLabelText(/Entity Name/);
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(await screen.findByText("Changes saved")).toBeInTheDocument();
  const after = await getOrganization("1");
  expect(after.updatedAt).toBe(before.updatedAt);
  expect(after.verifiedAt).not.toBe(before.verifiedAt);
});
