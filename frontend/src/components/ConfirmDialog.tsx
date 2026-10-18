import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./ui";

// A pop-up that asks "are you sure?" before an important change.
// Styled like the mockups' pop-ups: centered card, round icon, title, short message.
// Reusable: the entity form and the contact form both use it.
type Props = {
  title: string;
  message: string;
  confirmLabel: string; // e.g. "Flag record"
  busyLabel: string; // e.g. "Flagging…"
  busy: boolean; // true while the change is running
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode; // optional extra content, e.g. a "reason" box
};

export default function ConfirmDialog({ title, message, confirmLabel, busyLabel, busy, onConfirm, onCancel, children }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // When the dialog first opens, put focus on Cancel (the safe choice).
  // Empty [] = run only once, so typing in the reason box doesn't jump back to Cancel.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Let the Escape key close the dialog
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey); // clean up when the dialog closes
  }, [busy, onCancel]);

  return (
    // Dark see-through background behind the dialog
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-xl"
      >
        {/* Amber "!" like the mockup's "records couldn't be verified" pop-up */}
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-lg font-bold text-amber-700" aria-hidden="true">
          !
        </div>
        <h2 id="confirm-title" className="mt-3 text-lg font-semibold">
          {title}
        </h2>
        <p id="confirm-message" className="mt-2 text-sm text-muted">
          {message}
        </p>
        {children && <div className="mt-4 text-left">{children}</div>}
        <div className="mt-6 flex justify-center gap-3">
          <Button ref={cancelRef} type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={busy}>
            {busy ? busyLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
