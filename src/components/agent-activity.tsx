"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, Workflow } from "lucide-react";
import type { ChatStep } from "@/lib/api";

const RUNNING = ["Reading the decision", "Asking Mistral", "Checking quotes against the decision"];

// What the agent did for one answer: the steps the backend actually ran (no model-written reasoning).
export function AgentActivity({ steps, running = false }: { steps?: ChatStep[]; running?: boolean }) {
  const rows: (ChatStep & { active?: boolean })[] = running
    ? RUNNING.map((label) => ({ label, detail: "", status: "ok", active: true }))
    : (steps ?? []);
  if (!rows.length) return null;
  const warns = rows.filter((s) => s.status === "warn").length;

  return (
    <details open className="group mb-3 overflow-hidden rounded-xl border border-line bg-ink/60">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[13px] text-muted hover:bg-elevated/60 [&::-webkit-details-marker]:hidden">
        <span className="flex size-6 items-center justify-center rounded-md bg-sky/70 text-gold">
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <Workflow className="size-3.5" />}
        </span>
        <span className="font-medium text-paper">{running ? "Working…" : "Agent activity"}</span>
        <span className="rounded-full bg-elevated px-2 py-0.5 font-mono text-[10px] text-faint">
          {running ? "running" : `${rows.length} steps${warns ? ` · ${warns} to note` : ""}`}
        </span>
        <ChevronDown className="ml-auto size-4 text-faint transition group-open:rotate-180" />
      </summary>
      <ol className="border-t border-line px-3 pb-1 pt-3">
        {rows.map((s, i) => (
          <li key={i} className="relative flex gap-2.5 pb-3 last:pb-2">
            {i < rows.length - 1 ? <span aria-hidden className="absolute left-[7px] top-5 h-[calc(100%-14px)] w-px bg-line" /> : null}
            <span className="relative mt-0.5 shrink-0">
              {s.active ? (
                <Loader2 className="size-4 animate-spin text-gold" />
              ) : s.status === "warn" ? (
                <AlertTriangle className="size-4 text-[#b54708]" />
              ) : (
                <CheckCircle2 className="size-4 text-[#067647]" />
              )}
            </span>
            <span className="min-w-0">
              <span className={`block text-[13px] font-medium ${s.active ? "text-gold" : "text-paper"}`}>{s.label}</span>
              {s.detail ? <span className="block text-[12px] leading-relaxed text-faint">{s.detail}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
