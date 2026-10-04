"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Clock } from "lucide-react";
import { day, eur, getCase, getDeliveries, getPitch, num, type CaseJson, type Delivery, type WorkItem } from "@/lib/api";
import { PageHeader } from "@/components/page-header";

type Details = { c: CaseJson; base: number | null; solvency: string | null; finalized: boolean; sent: Delivery[]; category: string | null };

const DATA_LABEL: Record<string, string> = { identity: "identity", contact: "contact", iban: "IBAN", health: "health", password: "passwords", other: "other data" };

// The association's cases: real defendant, decision, a short summary of the breach, key figures and brief status.
export function WorkspaceList({ work, onOpen, onDecisions }: { work: WorkItem[]; onOpen: (caseId: string) => void; onDecisions: () => void }) {
  const [details, setDetails] = useState<Record<string, Details>>({});

  useEffect(() => {
    for (const w of work) {
      if (!w.case_id) continue;
      const id = w.case_id;
      Promise.all([getCase(id), getPitch(id), getDeliveries(id)])
        .then(([c, { brief }, sent]) =>
          setDetails((d) => ({
            ...d,
            [id]: {
              c,
              base: brief.value.scenarios.value?.find((s) => s.name === "base")?.total_eur ?? null,
              solvency: brief.defendant.solvency.value,
              finalized: Boolean(brief.finalized_at),
              sent,
              category: brief.value.harm_category.value,
            },
          }))
        )
        .catch(() => null);
    }
  }, [work]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <PageHeader eyebrow="Your workspace" title="Cases" description="The decisions you chose to work on. Open one to complete, finalize and send the funding brief." />
      {!work.length ? (
        <div className="card mt-6 p-5 text-sm text-muted">
          No case yet.{" "}
          <button type="button" onClick={onDecisions} className="cursor-pointer font-medium text-gold">
            Pick a decision to work on
          </button>
          .
        </div>
      ) : null}
      <ul className="mt-6 space-y-4">
        {work.map((w, i) => {
          const d = w.case_id ? details[w.case_id] : undefined;
          const status = !d ? null : d.sent.length ? `Sent to ${d.sent.length} funder${d.sent.length > 1 ? "s" : ""}` : d.finalized ? "Finalized" : "Draft";
          const statusTone = !d ? "" : d.sent.length ? "bg-[#ecfdf3] text-[#067647]" : d.finalized ? "bg-sky text-gold-2" : "bg-elevated text-muted";
          return (
            <li key={w.radar_id} className={`rise rise-${Math.min(i + 1, 4)}`}>
              <button
                type="button"
                disabled={!w.case_id}
                onClick={() => w.case_id && onOpen(w.case_id)}
                className="card group w-full cursor-pointer p-5 text-left transition hover:-translate-y-0.5 disabled:cursor-default"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                      CNIL · {d ? d.c.decision.reference.replace(/^Délibération (de la formation restreinte )?/, "") : day(w.date)}
                    </p>
                    <h2 className="mt-1 font-serif text-2xl text-paper">{d?.c.defendant.name ?? w.organisation_type.toLowerCase().replace(/^./, (x) => x.toUpperCase())}</h2>
                  </div>
                  {status ? <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${statusTone}`}>{status}</span> : null}
                </div>

                {d?.c.breach.summary ? <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">{d.c.breach.summary}</p> : null}

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-[13px] sm:grid-cols-4">
                  <div>
                    <dt className="text-faint">Fine</dt>
                    <dd className="font-semibold tabular-nums text-paper">{eur(d?.c.decision.fine_total_eur ?? w.fine_eur)}</dd>
                  </div>
                  <div>
                    <dt className="text-faint">Affected</dt>
                    <dd className="font-semibold tabular-nums text-paper">{d ? `${num(d.c.breach.people_affected)} ${d.c.breach.people_affected_unit}` : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-faint">Claim (base)</dt>
                    <dd className="font-semibold tabular-nums text-paper">{d ? eur(d.base) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-faint">Defendant</dt>
                    <dd className="font-semibold capitalize text-paper">{d?.solvency ?? "—"}</dd>
                  </div>
                </dl>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {(d?.c.breach.data_types ?? []).map((t) => (
                      <span key={t} className="rounded-full bg-elevated px-2 py-0.5 text-[11px] text-muted">
                        {DATA_LABEL[t] ?? t}
                      </span>
                    ))}
                    {d?.c.violations.map((v) => (
                      <span key={v.gdpr_article} className="rounded-full bg-sky/70 px-2 py-0.5 text-[11px] text-gold-2">
                        GDPR art. {v.gdpr_article}
                      </span>
                    ))}
                  </div>
                  {w.case_id ? (
                    <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-gold group-hover:gap-2 transition-all">
                      Open the brief <ArrowRight className="size-4" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[13px] text-faint">
                      <Clock className="size-4" /> Analysis requested
                    </span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
