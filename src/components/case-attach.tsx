"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FileText, Paperclip } from "lucide-react";
import { eur, getCase, num, type CaseJson } from "@/lib/api";

// The case attached to the chat, shown as a chip inside the input box; click it to attach another case.
export function CaseAttach({ options, value, onChange }: { options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [c, setCase] = useState<CaseJson | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) getCase(value).then(setCase).catch(() => setCase(null));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex max-w-full cursor-pointer items-center gap-2 rounded-xl border border-line bg-ink/70 py-1.5 pl-1.5 pr-2.5 text-left transition hover:border-gold/40"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky text-gold">
          <FileText className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold text-paper">{c?.defendant.name ?? "Attach a case"}</span>
          {c ? (
            <span className="block truncate text-[11px] text-faint">
              CNIL {c.decision.reference.replace(/^Délibération (de la formation restreinte )?/, "")} · fine {eur(c.decision.fine_total_eur)} · {num(c.breach.people_affected)} affected
            </span>
          ) : null}
        </span>
        {options.length > 1 ? <ChevronDown className={`size-4 shrink-0 text-faint transition ${open ? "rotate-180" : ""}`} /> : null}
      </button>

      {open ? (
        <div role="listbox" className="absolute bottom-full left-0 z-20 mb-2 w-80 overflow-hidden rounded-2xl border border-line bg-panel p-1.5 shadow-[0_18px_40px_-12px_rgba(23,43,77,0.3)]">
          <p className="flex items-center gap-1.5 px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
            <Paperclip className="size-3.5" /> Attach a case
          </p>
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={o.id === value}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              className={`flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] hover:bg-elevated ${o.id === value ? "font-semibold text-paper" : "text-muted"}`}
            >
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.id === value ? <Check className="size-4 text-gold" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
