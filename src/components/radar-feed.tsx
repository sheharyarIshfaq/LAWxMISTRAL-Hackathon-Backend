"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { ApiError, day, eur, getRadar, scanRadar, type RadarFeed as Feed, type RadarItem } from "@/lib/api";

const FILTERS = [
  { id: "candidate", label: "Candidates", test: (i: RadarItem) => i.status === "candidate" },
  { id: "public", label: "Public bodies", test: (i: RadarItem) => i.status === "candidate_public" },
  { id: "breach", label: "All data breaches", test: (i: RadarItem) => i.data_breach },
  { id: "filtered", label: "Filtered out", test: (i: RadarItem) => i.status === "filtered" },
  { id: "all", label: "All", test: () => true },
] as const;

const PRIORITY_STYLE: Record<string, string> = {
  high: "bg-[#dcfae6] text-[#085d3a]",
  medium: "bg-[#fef0c7] text-[#93370d]",
  low: "bg-elevated text-muted",
};

// Step 1 of the flow: the CNIL publishes sanctions; the radar flags the data breaches worth a collective action.
export function RadarFeed({ onOpenCase }: { onOpenCase: (caseId: string) => void }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("candidate");
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);

  const load = () =>
    getRadar()
      .then((f) => {
        setFeed(f);
        setError(null);
      })
      .catch((e: ApiError) => setError(e.message));

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    const test = FILTERS.find((f) => f.id === filter)!.test;
    return (feed?.items ?? []).filter(test);
  }, [feed, filter]);

  const rescan = async () => {
    setScanning(true);
    try {
      const r = await scanRadar();
      setLastScan(r.new ? `${r.new} new decision${r.new > 1 ? "s" : ""} found` : "No new decision since the last scan");
      await load();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-paper">CNIL radar</h1>
          <p className="mt-1 text-[13px] text-faint">
            Every sanction published by the CNIL, triaged for collective-action potential.
            {feed ? ` Last scan ${day(feed.scanned_at.slice(0, 10))}${feed.from_cache ? " (saved copy)" : ""}.` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={rescan}
          disabled={scanning}
          className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl bg-elevated px-3 text-sm font-medium hover:bg-hover disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${scanning ? "animate-spin" : ""}`} /> {scanning ? "Scanning…" : "Scan CNIL now"}
        </button>
      </div>
      {lastScan ? <p className="mt-2 text-[13px] text-gold">{lastScan}</p> : null}

      {feed ? (
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Sanctions scanned", feed.stats.total],
            ["Data breaches", feed.stats.data_breaches],
            ["Candidates", feed.stats.candidates],
            ["High priority", feed.stats.high_priority],
          ].map(([label, n]) => (
            <div key={label} className="rounded-xl bg-panel p-3">
              <p className="text-2xl font-semibold tabular-nums text-paper">{n}</p>
              <p className="text-[12px] text-faint">{label}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-1" role="tablist" aria-label="Radar filter">
        {FILTERS.map((f) => {
          const active = f.id === filter;
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.id)}
              className={`h-8 cursor-pointer rounded-full px-3 text-[13px] font-medium ${active ? "bg-paper text-white" : "text-muted hover:bg-elevated"}`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {error ? <p className="mt-6 rounded-xl bg-[#fee4e2] p-3 text-sm text-[#b42318]">{error}</p> : null}
      {!feed && !error ? <p className="mt-6 text-sm text-muted">Loading the CNIL radar…</p> : null}

      <ul className="mt-4 divide-y divide-line">
        {rows.map((item) => (
          <li key={item.id} className="py-5">
            <div className="flex flex-wrap items-center gap-2">
              {item.is_new ? <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-semibold text-white">NEW</span> : null}
              {item.priority ? (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${PRIORITY_STYLE[item.priority]}`}>{item.priority} priority</span>
              ) : null}
              {item.public_body ? <span className="rounded-full bg-elevated px-2 py-0.5 text-[11px] font-medium text-muted">Public body</span> : null}
              <span className="ml-auto text-[13px] text-faint">CNIL · {day(item.date)}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-serif text-xl capitalize text-paper">{item.organisation_type.toLowerCase()}</h2>
              <p className="text-lg font-semibold tabular-nums text-paper">{item.fine_eur ? eur(item.fine_eur) : "No fine"}</p>
            </div>
            <p className="mt-1 text-[13px] text-muted">{item.decision}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{item.themes}</p>
            <ul className="mt-3 space-y-1">
              {item.reasons.map((r) => (
                <li key={r} className="text-[13px] text-faint">
                  · {r}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              {item.case_id ? (
                <button
                  type="button"
                  onClick={() => onOpenCase(item.case_id!)}
                  className="h-10 cursor-pointer rounded-xl bg-fill px-3 text-sm font-semibold text-white hover:bg-fill-2"
                >
                  Open the case
                </button>
              ) : item.status !== "filtered" ? (
                <span className="inline-flex h-10 items-center rounded-xl bg-elevated px-3 text-sm text-faint">Not processed yet</span>
              ) : null}
              {item.legifrance_url ? (
                <a
                  href={item.legifrance_url}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-elevated px-3 text-sm font-medium hover:bg-hover"
                >
                  Decision on Légifrance <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {feed && !rows.length ? <p className="mt-6 text-sm text-muted">Nothing in this filter.</p> : null}
    </div>
  );
}
