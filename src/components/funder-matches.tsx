"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { ApiError, eur, getMatches, type Match } from "@/lib/api";

const FIT_STYLE = {
  strong: "bg-[#dcfae6] text-[#085d3a]",
  partial: "bg-[#fef0c7] text-[#93370d]",
  weak: "bg-[#fee4e2] text-[#b42318]",
};
const STATUS_ICON = { met: "✓", not_met: "✗", unknown: "?" };
const STATUS_STYLE = { met: "text-[#085d3a]", not_met: "text-[#b42318]", unknown: "text-faint" };
const LABEL: Record<string, string> = {
  funder_type: "Funder",
  jurisdiction: "France",
  collective_actions: "Collective actions",
  case_type: "Case type",
  claim_size: "Claim size",
  defendant_type: "Defendant",
};
const ORIGIN = { curated: "Legal team's list", platform: "On the platform", discovered: "Found on the web" };

// Step 4: funders matched to the case in code (no score, no probability), with the reason for each criterion.
export function FunderMatches({ caseId }: { caseId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getMatches>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fit, setFit] = useState<"strong" | "partial" | "weak" | "all">("all");
  const [shown, setShown] = useState(15);

  useEffect(() => {
    getMatches(caseId).then(setData).catch((e: ApiError) => setError(e.message));
  }, [caseId]);

  const rows = useMemo(() => (data?.matches ?? []).filter((m) => fit === "all" || m.fit === fit), [data, fit]);

  if (error) return <p className="rounded-xl bg-[#fee4e2] p-3 text-sm text-[#b42318]">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Matching funders…</p>;

  return (
    <div>
      <p className="text-[13px] text-faint">
        {data.total} funders checked against this case (base claim {eur(data.claim_base_eur)}): {data.counts.strong} strong, {data.counts.partial} partial,{" "}
        {data.counts.weak} weak. Matching is done in code, criterion by criterion; unknown facts are never assumed.
      </p>
      <div className="mt-3 flex flex-wrap gap-1">
        {(["all", "strong", "partial", "weak"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => {
              setFit(f);
              setShown(15);
            }}
            className={`h-8 cursor-pointer rounded-full px-3 text-[13px] font-medium capitalize ${fit === f ? "bg-paper text-white" : "text-muted hover:bg-elevated"}`}
          >
            {f === "all" ? "All" : `${f} (${data.counts[f]})`}
          </button>
        ))}
      </div>

      <ul className="mt-4 space-y-3">
        {rows.slice(0, shown).map((m) => (
          <MatchRow key={m.funder.id} m={m} />
        ))}
      </ul>
      {rows.length > shown ? (
        <button type="button" onClick={() => setShown((n) => n + 15)} className="mt-4 h-10 cursor-pointer rounded-xl bg-elevated px-4 text-sm font-medium hover:bg-hover">
          Show more ({rows.length - shown} left)
        </button>
      ) : null}
    </div>
  );
}

function MatchRow({ m }: { m: Match }) {
  const f = m.funder;
  const link = f.website ?? f.lookup_url ?? null;
  return (
    <li className="rounded-xl bg-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${FIT_STYLE[m.fit]}`}>{m.fit}</span>
        <h3 className="text-base font-semibold text-paper">{f.name}</h3>
        {f.demo ? <span className="rounded-full bg-elevated px-2 py-0.5 text-[11px] text-muted">Fictional demo profile</span> : null}
        <span className="ml-auto text-[12px] text-faint">{ORIGIN[f.origin]}{f.funder_type ? ` · ${f.funder_type}` : ""}</span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {m.criteria.map((c) => (
          <li key={c.criterion} className="text-[13px]" title={c.detail}>
            <span className={`font-semibold ${STATUS_STYLE[c.status]}`}>{STATUS_ICON[c.status]}</span>{" "}
            <span className="text-muted">{LABEL[c.criterion] ?? c.criterion}</span>
            {c.status !== "met" ? <span className="text-faint">: {c.detail}</span> : null}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-faint">{m.note}</p>
      <div className="mt-2 flex flex-wrap gap-3 text-[12px]">
        {link ? (
          <a href={link} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-medium text-gold">
            {f.website ? "Website" : "Look up"} <ExternalLink className="size-3" />
          </a>
        ) : null}
        {f.sources.slice(0, 3).map((s) => (
          <a key={s.url} href={s.url} target="_blank" rel="noopener" className="max-w-[220px] truncate text-faint hover:text-gold">
            {s.title}
          </a>
        ))}
      </div>
    </li>
  );
}
