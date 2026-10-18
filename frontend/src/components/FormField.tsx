// One labeled text box with its inline error message.
// Saves repeating the same label + input + error markup for every field.
type Props = {
  id: string;
  label: string;
  value: string;
  error?: string;
  optional?: boolean;
  onChange: (value: string) => void;
  onBlur: () => void;
};

export default function FormField({ id, label, value, error, optional, onChange, onBlur }: Props) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label} {optional ? <span className="font-normal text-slate-500">(optional)</span> : "*"}
      </label>
      <input
        id={id}
        className={`mt-1 w-full rounded border px-3 py-2 ${error ? "border-red-500" : "border-slate-300"}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && <p id={`${id}-error`} className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
