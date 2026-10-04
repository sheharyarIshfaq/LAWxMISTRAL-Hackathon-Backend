"use client";

// Small "attach a case" selector used by the Agent / AI tabs and the Funders tab.
export function CasePicker({
  options,
  value,
  onChange,
  label = "Case",
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  if (!options.length) return null;
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-faint">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-xl border border-line bg-white px-3 text-sm text-paper">
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
