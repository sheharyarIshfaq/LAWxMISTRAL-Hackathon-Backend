"use client";

import { ChevronDown } from "lucide-react";

// Case selector styled as a card: a native <select> laid invisibly over it keeps keyboard and accessibility.
export function CasePicker({
  options,
  value,
  onChange,
  label = "Case",
  detail,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  detail?: string;
}) {
  if (!options.length) return null;
  const current = options.find((o) => o.id === value) ?? options[0];
  return (
    <label className="relative block min-w-64 cursor-pointer rounded-2xl border border-line bg-panel px-4 py-2.5 shadow-[0_1px_0_rgba(23,43,77,0.04)] transition hover:border-gold/40 focus-within:border-gold/60 focus-within:shadow-[0_0_0_3px_rgba(47,95,163,0.12)]">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">{label}</span>
      <span className="mt-0.5 block pr-7 text-sm font-semibold text-paper">{current.label}</span>
      {detail ? <span className="block pr-7 text-[12px] text-faint">{detail}</span> : null}
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
      <select
        value={current.id}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
