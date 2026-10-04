"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { eur, getCase, num, type CaseJson } from "@/lib/api";
import { CaseChat } from "@/components/case-chat";

// Full-height agent page shared by both desks: header with the attached case, then the chat.
export function AgentPanel({
  title,
  subtitle,
  options,
  value,
  onChange,
  empty,
}: {
  title: string;
  subtitle: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  empty: string;
}) {
  const [c, setCase] = useState<CaseJson | null>(null);
  useEffect(() => {
    if (value) getCase(value).then(setCase).catch(() => setCase(null));
  }, [value]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Agent</p>
            <h1 className="mt-1 font-serif text-3xl text-paper">{title}</h1>
            <p className="mt-0.5 text-[13px] text-faint">{subtitle}</p>
          </div>
          {options.length ? (
            <label className="relative block min-w-64 cursor-pointer rounded-2xl border border-line bg-panel px-4 py-2.5 shadow-[0_1px_0_rgba(23,43,77,0.04)] transition hover:border-gold/40">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">Attached case</span>
              <span className="mt-0.5 block pr-6 text-sm font-semibold text-paper">{c?.defendant.name ?? "…"}</span>
              {c ? (
                <span className="block text-[12px] text-faint">
                  {c.decision.reference.replace(/^Délibération /, "")} · fine {eur(c.decision.fine_total_eur)} · {num(c.breach.people_affected)} affected
                </span>
              ) : null}
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <select value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Attached case">
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </header>
      {value ? <CaseChat key={value} caseId={value} /> : <p className="mx-auto mt-16 max-w-sm text-center text-sm text-faint">{empty}</p>}
    </div>
  );
}

