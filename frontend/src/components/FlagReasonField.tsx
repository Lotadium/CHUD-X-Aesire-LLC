// "Why is this no longer valid?" box shown inside the flag dialog.
// Required: the API (CHUD-13) rejects a flag without a reason, and the reason
// is saved with the flag so the record's history explains it.
export default function FlagReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor="flagReason" className="block text-sm font-medium text-ink">
        Reason
      </label>
      <textarea
        id="flagReason"
        rows={2}
        maxLength={500}
        required
        aria-describedby="flagReason-hint"
        placeholder="e.g. District merged with Elk Grove Water"
        className="mt-1.5 block w-full rounded-lg border border-line bg-white px-3.5 py-2 text-sm text-ink placeholder:text-slate-400 focus:border-brand-strong focus:outline-none focus:ring-2 focus:ring-brand/30"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p id="flagReason-hint" className="mt-1.5 text-xs text-muted">
        Required. Saved with the record's history.
      </p>
    </div>
  );
}
