"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Brain, CheckCircle2, ChevronDown, Loader2, Workflow } from "lucide-react";

export type LiveStep = { id?: string; label: string; detail: string; status: "running" | "ok" | "warn" };

// What the agent is doing, live: the backend's steps as they start and finish, and the model's reasoning as it streams.
export function AgentActivity({ steps, thinking, running = false }: { steps?: LiveStep[]; thinking?: string; running?: boolean }) {
  const rows = steps ?? [];
  const thought = useRef<HTMLDivElement>(null);

  // Keep the newest reasoning in view while it streams.
  useEffect(() => {
    if (running && thought.current) thought.current.scrollTop = thought.current.scrollHeight;
  }, [thinking, running]);

  if (!rows.length && !thinking) return null;
  const warns = rows.filter((s) => s.status === "warn").length;
  const current = rows.findLast((s) => s.status === "running");

  return (
    <details open className="group mb-3 overflow-hidden rounded-xl border border-line bg-ink/60">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[13px] text-muted hover:bg-elevated/60 [&::-webkit-details-marker]:hidden">
        <span className="flex size-6 items-center justify-center rounded-md bg-sky/70 text-gold">
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <Workflow className="size-3.5" />}
        </span>
        <span className="truncate font-medium text-paper">{running ? (current?.label ?? "Working") + "…" : "Agent activity"}</span>
        <span className="shrink-0 rounded-full bg-elevated px-2 py-0.5 text-[10px] font-medium text-faint">
          {running ? "live" : `${rows.length} steps${warns ? ` · ${warns} to note` : ""}`}
        </span>
        <ChevronDown className="ml-auto size-4 shrink-0 text-faint transition group-open:rotate-180" />
      </summary>
      <ol className="border-t border-line px-3 pb-1 pt-3">
        {rows.map((s, i) => (
          <li key={s.id ?? i} className="relative flex gap-2.5 pb-3 last:pb-2">
            {i < rows.length - 1 ? <span aria-hidden className="absolute left-[7px] top-5 h-[calc(100%-14px)] w-px bg-line" /> : null}
            <span className="relative mt-0.5 shrink-0">
              {s.status === "running" ? (
                <Loader2 className="size-4 animate-spin text-gold" />
              ) : s.status === "warn" ? (
                <AlertTriangle className="size-4 text-[#b54708]" />
              ) : (
                <CheckCircle2 className="size-4 text-[#067647]" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-[13px] font-medium ${s.status === "running" ? "text-gold" : "text-paper"}`}>{s.label}</span>
              {s.detail ? <span className="block text-[12px] leading-relaxed text-faint">{s.detail}</span> : null}
              {s.id === "think" && thinking ? (
                <div className="mt-2 rounded-lg border border-line bg-panel">
                  <p className="flex items-center gap-1.5 border-b border-line px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                    <Brain className="size-3.5" /> Model&apos;s reasoning{running && s.status === "running" ? " · live" : ""}
                  </p>
                  <div ref={thought} className="max-h-48 overflow-y-auto whitespace-pre-wrap px-2.5 py-2 text-[12px] leading-relaxed text-muted">
                    {thinking}
                    {running && s.status === "running" ? <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-gold align-middle" /> : null}
                  </div>
                </div>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
