import { useEffect, useRef } from "react";

// A pop-up that asks "are you sure?" before something that can't be undone.
// Reusable: the organization form and the contact form both use it.
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
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 id="confirm-title" className="text-lg font-semibold">{title}</h2>
        <p id="confirm-message" className="mt-2 text-sm text-slate-600">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded border border-slate-300 px-4 py-2 font-medium hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-800 disabled:opacity-50"
          >
            {busy ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
