// AI use: written with AI help from Claude Code (Sonnet 5.5), directed by Irene Riva. See "AI use" in backend/README.md.
import { insertRow, updateRow, type Actor, type Queryable } from "../db.ts";
import { withEmailParts } from "../routes/people.ts";
import type { Parsed } from "../validate.ts";
import type { ContactDetails } from "./types.ts";

/** A contact we already have: a person, their position at the entity being refreshed, and their emails. */
export type StoredContact = {
  person_id: number;
  position_id: number;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  title: string | null;
  phone: string | null;
  emails: { email_id: number; address: string }[];
};

/** What to write for one contact. Only things that differ from what is stored. */
export type ContactPlan = {
  position: Parsed; // changed position columns (title, phone); empty when nothing changed
  email:
    | { kind: "none" } // the page showed no usable email
    | { kind: "same" } // already stored
    | { kind: "update"; email_id: number; address: string } // the contact's only email changed
    | { kind: "insert"; address: string } // a new email for this contact
    | { kind: "conflict"; address: string }; // the address belongs to a different contact
};

const MAX_TITLE = 300;
const MAX_PHONE = 30;
const MAX_EMAIL = 300;

function tidy(value: string | null | undefined): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

/** Digits only, without a leading US country code, so "+1-916-555-0100" equals "(916) 555-0100". */
export function phoneDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

/** A phone number with exactly 10 digits (charter 2.3 e.iv), as shown on the website, or null. */
export function usablePhone(value: string | null): string | null {
  const phone = tidy(value);
  if (!phone || phone.length > MAX_PHONE || phoneDigits(phone).length !== 10) return null;
  return phone;
}

/** A usable lowercase email address, or null. The email table only accepts lowercase addresses. */
export function usableEmail(value: string | null): string | null {
  const address = tidy(value)?.toLowerCase() ?? null;
  if (!address || address.length > MAX_EMAIL || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return null;
  return address;
}

/**
 * Compare what the website says with what we store and decide what to write (CHUD-35):
 * existing rows are updated in place, never duplicated, and only changed values are written.
 *
 * Email: a stored address that matches is left alone. If the contact has exactly one email and the
 * page shows a different one, that row is updated (the old address stays in record_history).
 * If the contact has none, or several, the new address is added. An address that already belongs
 * to a different contact is never moved: it is reported as a conflict.
 *
 * `emailOwner` is the person_id that already owns the page's address, or null when nobody does.
 */
export function planContact(contact: StoredContact, details: ContactDetails, emailOwner: number | null): ContactPlan {
  const position: Parsed = {};

  const title = tidy(details.title);
  if (title && title.length <= MAX_TITLE && title !== contact.title) position.title = title;

  const phone = usablePhone(details.phone);
  if (phone && phoneDigits(phone) !== phoneDigits(contact.phone ?? "")) position.phone = phone;

  const address = usableEmail(details.email);
  let email: ContactPlan["email"];
  if (!address) {
    email = { kind: "none" };
  } else if (contact.emails.some((e) => e.address.toLowerCase() === address)) {
    email = { kind: "same" };
  } else if (emailOwner !== null && emailOwner !== contact.person_id) {
    email = { kind: "conflict", address };
  } else if (contact.emails.length === 1) {
    email = { kind: "update", email_id: contact.emails[0].email_id, address };
  } else {
    email = { kind: "insert", address };
  }
  return { position, email };
}

/** Write a plan. Every row written is marked as made by the refresh (REFRESH), not by a person. */
export async function applyPlan(db: Queryable, actor: Actor, contact: StoredContact, plan: ContactPlan): Promise<void> {
  const now = new Date().toISOString();
  // The position is the record "this person at this entity", so it carries the verified date.
  await updateRow(
    db,
    "position",
    "position_id",
    contact.position_id,
    { ...plan.position, last_verified_at: now },
    actor,
    "REFRESH",
  );

  if (plan.email.kind === "update") {
    await updateRow(
      db,
      "email",
      "email_id",
      plan.email.email_id,
      { ...withEmailParts({ address: plan.email.address }), last_verified_at: now },
      actor,
      "REFRESH",
    );
  } else if (plan.email.kind === "insert") {
    await insertRow(
      db,
      "email",
      { ...withEmailParts({ address: plan.email.address }), person_id: contact.person_id, last_verified_at: now },
      actor,
      "REFRESH",
    );
  }
}
