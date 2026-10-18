// Optional "why is this no longer valid?" box shown inside the flag dialog.
// The reason is saved with the flag so the history explains it.
export default function FlagReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor="flagReason" className="block text-sm font-medium text-ink">
        Reason <span className="font-normal text-muted">(optional)</span>
      </label>
      <textarea
        id="flagReason"
        rows={2}
        maxLength={300}
        placeholder="e.g. District merged with Elk Grove Water"
        className="mt-1.5 block w-full rounded-lg border border-line bg-white px-3.5 py-2 text-sm text-ink placeholder:text-slate-400 focus:border-brand-strong focus:outline-none focus:ring-2 focus:ring-brand/30"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
