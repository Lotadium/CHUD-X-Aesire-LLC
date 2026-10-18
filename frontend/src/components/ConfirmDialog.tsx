import { useEffect, useRef } from "react";
import { Button } from "./ui";

// A pop-up that asks "are you sure?" before something that can't be undone.
// Styled like the mockups' pop-ups: centered card, round icon, title, short message.
// Reusable: the entity form and the contact form both use it.
type Props = {
  title: string;
  message: string;
  confirmLabel: string; // e.g. "Delete"
  busy: boolean; // true while the delete is running
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({ title, message, confirmLabel, busy, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  // When the dialog opens, put focus on Cancel (the safe choice),
  // and let the Escape key close it.
  useEffect(() => {
    cancelRef.current?.focus();
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
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-lg font-bold text-red-600" aria-hidden="true">
          !
        </div>
        <h2 id="confirm-title" className="mt-3 text-lg font-semibold">
          {title}
        </h2>
        <p id="confirm-message" className="mt-2 text-sm text-muted">
          {message}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button ref={cancelRef} type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Deleting…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
