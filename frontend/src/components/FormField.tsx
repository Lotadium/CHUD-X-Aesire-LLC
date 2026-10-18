// One labeled input (or dropdown) with its inline error message.
// Styled like the inputs in the Figma mockups.

const inputClass = (hasError: boolean) =>
  `mt-1.5 block h-11 w-full rounded-lg border bg-white px-3.5 text-[15px] text-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
    hasError
      ? "border-red-500 focus:border-red-500 focus:ring-red-200"
      : "border-line focus:border-brand-strong focus:ring-brand/30"
  }`;

type BaseProps = {
  id: string;
  label: string;
  value: string;
  error?: string;
  optional?: boolean;
  className?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
};

function Label({ id, label, optional }: { id: string; label: string; optional?: boolean }) {
  return (
    <label htmlFor={id} className="block text-sm font-medium text-ink">
      {label}
      {optional && <span className="font-normal text-muted"> (optional)</span>}
    </label>
  );
}

function ErrorText({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={`${id}-error`} className="mt-1.5 text-xs text-red-600">
      {error}
    </p>
  );
}

export default function FormField({ id, label, value, error, optional, className = "", onChange, onBlur }: BaseProps) {
  return (
    <div className={className}>
      <Label id={id} label={label} optional={optional} />
      <input
        id={id}
        className={inputClass(!!error)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <ErrorText id={id} error={error} />
    </div>
  );
}

// Same look, but a dropdown (used for Domain and Entity)
export function SelectField({
  id,
  label,
  value,
  error,
  optional,
  className = "",
  placeholder,
  options,
  onChange,
  onBlur,
}: BaseProps & { placeholder: string; options: { id: string; name: string }[] }) {
  return (
    <div className={className}>
      <Label id={id} label={label} optional={optional} />
      <select
        id={id}
        className={inputClass(!!error)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <ErrorText id={id} error={error} />
    </div>
  );
}
