"use client";

import { useEffect, useState } from "react";
import { ApiError, day, eur, getPitch, listCases, num, type CaseListItem, type Scenario } from "@/lib/api";

type Row = CaseListItem & { base?: Scenario; category?: string | null; solvency?: string | null };

// The cases that have a funding brief, for the association (its pitches) or the investor (pitches sent to them).
export function CaseList({ mode, onOpen }: { mode: "association" | "investor"; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCases()
      .then(async (cases) => {
        const withBrief = await Promise.all(
          cases.map(async (c) => {
            try {
              const { brief } = await getPitch(c.id);
              return {
                ...c,
                base: brief.value.scenarios.value?.find((s) => s.name === "base"),
                category: brief.value.harm_category.value,
                solvency: brief.defendant.solvency.value,
              };
            } catch {
              return c;
            }
          })
        );
        setRows(withBrief);
      })
      .catch((e: ApiError) => setError(e.message));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <h1 className="font-serif text-3xl text-paper">{mode === "association" ? "Cases" : "Pitches"}</h1>
      <p className="mt-1 text-[13px] text-faint">
        {mode === "association"
          ? "CNIL data-breach decisions turned into a funding brief. Open one to review the brief, the decision summary and the matching funders."
          : "Funding briefs from associations. Open one to read the brief and question the decision."}
      </p>
      {error ? <p className="mt-6 rounded-xl bg-[#fee4e2] p-3 text-sm text-[#b42318]">{error}</p> : null}
      {!rows && !error ? <p className="mt-6 text-sm text-muted">Loading…</p> : null}
      <ul className="mt-5 space-y-3">
        {rows?.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onOpen(c.id)} className="w-full cursor-pointer rounded-xl bg-panel p-4 text-left transition-colors hover:bg-elevated">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-serif text-xl text-paper">{c.defendant ?? c.id}</h2>
                <span className="text-[13px] text-faint">CNIL · {day(c.date)}</span>
              </div>
              <p className="mt-1 text-sm text-muted">
                Fine {eur(c.fine_total_eur)} · {num(c.people_affected)} affected · {c.data_types.join(", ")}
              </p>
              {c.base ? (
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
                  <span>
                    <span className="text-faint">Claim (base) </span>
                    <span className="font-semibold text-paper">{eur(c.base.total_eur)}</span>
                  </span>
                  {c.solvency ? (
                    <span>
                      <span className="text-faint">Solvency </span>
                      <span className="font-semibold capitalize text-paper">{c.solvency}</span>
                    </span>
                  ) : null}
                  {c.category ? <span className="text-faint">{c.category}</span> : null}
                </div>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
