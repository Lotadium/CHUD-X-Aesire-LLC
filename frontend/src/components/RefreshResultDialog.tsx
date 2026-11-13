// Pop-up shown when a refresh finishes (CHUD-33). AI use: written with help from Claude (Anthropic).
// Two versions, from the Figma mockups:
//   "All 50 records verified"          green check, Done button
//   "12 records couldn't be verified"  amber "!", the first 5 with reasons, "+ N more", Review records button
import { useEffect, useRef } from "react";
import { Button } from "./ui";
import type { UnverifiedRecord } from "../lib/refreshApi";

const SHOW_FIRST = 5;

type Props = {
  total: number;
  verified: number;
  updated: number; // records where the refresh saved new details
  unverified: UnverifiedRecord[];
  onDone: () => void; // all verified: close the pop-up
  onReview: () => void; // some failed: go to the records that need attention (CHUD-37)
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default function RefreshResultDialog({ total, verified, updated, unverified, onDone, onReview }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const allVerified = unverified.length === 0;
  const close = allVerified ? onDone : onReview;
  // e.g. ", 5 with new details saved"
  const updatedNote = updated > 0 ? `, ${updated} with new details saved` : "";

  // Put focus on the only button, so Enter or Space closes the pop-up
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  // Escape closes it too
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="refresh-result-title"
        aria-describedby="refresh-result-message"
        className={`w-full rounded-xl bg-white p-6 text-center shadow-xl ${allVerified ? "max-w-sm" : "max-w-md"}`}
      >
        {allVerified ? (
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-green-100 text-green-700" aria-hidden="true">
            <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        ) : (
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-lg font-bold text-amber-700" aria-hidden="true">
            !
          </div>
        )}

        <h2 id="refresh-result-title" className="mt-3 text-lg font-semibold">
          {total === 0
            ? "No records to refresh"
            : allVerified
              ? total === 1 ? "The record was verified" : `All ${total} records verified`
              : `${plural(unverified.length, "record")} couldn’t be verified`}
        </h2>
        <p id="refresh-result-message" className="mt-2 text-sm text-muted">
          {total === 0
            ? "There are no records to check right now. Flagged records are never refreshed."
            : allVerified
              ? `${verified} of ${total} records were verified${updatedNote}. 0 records couldn’t be verified.`
              : `${verified} of ${total} records were verified${updatedNote}. ${unverified.length === 1 ? "This one" : `These ${unverified.length}`} couldn’t be verified:`}
        </p>

        {!allVerified && (
          <div className="mt-4 rounded-lg border border-line bg-canvas px-4 py-3 text-left text-sm">
            <ul className="space-y-1.5">
              {unverified.slice(0, SHOW_FIRST).map((r) => (
                <li key={r.organization_id} title={r.detail}>
                  {r.name} — {r.reason}
                </li>
              ))}
            </ul>
            {unverified.length > SHOW_FIRST && (
              <p className="mt-1.5 text-xs text-muted">+ {unverified.length - SHOW_FIRST} more</p>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-center">
          {allVerified ? (
            <Button ref={buttonRef} type="button" variant="success" className="px-8" onClick={onDone}>
              Done
            </Button>
          ) : (
            <Button ref={buttonRef} type="button" className="px-8" onClick={onReview}>
              Review records
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
