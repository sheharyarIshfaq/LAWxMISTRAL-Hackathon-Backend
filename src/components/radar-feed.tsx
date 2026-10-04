"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Mail } from "lucide-react";
import { ApiError, day, eur, getMonitor, getOutbox, getRadar, startWork, type Email, type MonitorState, type RadarFeed as Feed, type RadarItem, type WorkItem } from "@/lib/api";
import { proseClass, renderMarkdown } from "@/lib/markdown";

const FILTERS = [
  { id: "all", label: "All", test: () => true },
  { id: "qualified", label: "Qualified", test: (i: RadarItem) => Boolean(i.case_id) },
  { id: "candidate", label: "Candidates", test: (i: RadarItem) => i.status === "candidate" },
  { id: "public", label: "Public bodies", test: (i: RadarItem) => i.status === "candidate_public" },
  { id: "breach", label: "All data breaches", test: (i: RadarItem) => i.data_breach },
  { id: "filtered", label: "Filtered out", test: (i: RadarItem) => i.status === "filtered" },
] as const;

const PRIORITY_STYLE: Record<string, string> = {
  high: "bg-[#dcfae6] text-[#085d3a]",
  medium: "bg-[#fef0c7] text-[#93370d]",
  low: "bg-elevated text-muted",
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

// Step 1 of the flow: a background job monitors the CNIL and emails associations; here they see every decision
// and pick the ones to work on.
export function RadarFeed({ onStarted }: { onStarted: (work: WorkItem) => void }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [monitor, setMonitor] = useState<MonitorState | null>(null);
  const [alert, setAlert] = useState<Email | null>(null);
  const [showAlert, setShowAlert] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  const load = () =>
    getRadar()
      .then((f) => {
        setFeed(f);
        setError(null);
      })
      .catch((e: ApiError) => setError(e.message));

  useEffect(() => {
    load();
    getMonitor().then(setMonitor).catch(() => null);
    getOutbox("radar_alert").then((e) => setAlert(e[0] ?? null)).catch(() => null);
  }, []);

  const rows = useMemo(() => {
    const test = FILTERS.find((f) => f.id === filter)!.test;
    return (feed?.items ?? []).filter(test);
  }, [feed, filter]);

  const work = async (item: RadarItem) => {
    setStarting(item.id);
    try {
      onStarted(await startWork(item.id));
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <div>
        <h1 className="font-serif text-3xl text-paper">Decisions</h1>
        <p className="mt-1 text-[13px] text-faint">Every sanction published by the CNIL, triaged for collective-action potential.</p>
      </div>
      <div className="mt-4 rounded-xl bg-panel p-3 text-[13px] text-muted">
        <p>
          <span className="mr-1.5 inline-block size-2 rounded-full bg-[#12b76a] align-middle" />
          Monitoring the CNIL automatically{monitor ? ` every ${monitor.interval_hours} h · last check ${when(monitor.last_run)} · next check ${when(monitor.next_run)}` : ""}. New
          decisions worth a collective action are emailed to you.
        </p>
        {alert ? (
          <div className="mt-2 border-t border-line pt-2">
            <button type="button" onClick={() => setShowAlert((v) => !v)} className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-gold">
              <Mail className="size-4" /> Last alert: {alert.subject} · {when(alert.sent_at)}
            </button>
            {showAlert ? <div className={`mt-2 rounded-lg bg-ink p-3 ${proseClass} text-[13px]`} dangerouslySetInnerHTML={{ __html: renderMarkdown(alert.body) }} /> : null}
          </div>
        ) : null}
      </div>
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
              {f.id === "qualified" && feed ? ` (${feed.items.filter((i) => i.case_id).length})` : ""}
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
              {item.case_id ? <span className="rounded-full bg-[#e0eaff] px-2 py-0.5 text-[11px] font-semibold text-[#2d31a6]">QUALIFIED · brief ready</span> : null}
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
                  disabled={starting === item.id}
                  onClick={() => work(item)}
                  className="h-10 cursor-pointer rounded-xl bg-fill px-3 text-sm font-semibold text-white hover:bg-fill-2 disabled:opacity-50"
                >
                  {starting === item.id ? "Opening…" : "Work on this case"}
                </button>
              ) : (
                <span className="inline-flex h-10 items-center rounded-xl bg-elevated px-3 text-sm text-faint">Not qualified for processing</span>
              )}
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
