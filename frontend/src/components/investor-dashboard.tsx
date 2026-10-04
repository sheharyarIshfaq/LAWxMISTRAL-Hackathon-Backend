"use client";

import { PageHeader } from "@/components/page-header";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Inbox, LayoutDashboard, Sparkles } from "lucide-react";
import { AgentPanel } from "@/components/agent-panel";
import { CaseFile } from "@/components/case-file";
import { SidebarWithTabs, useTabs, type NavItem } from "@/components/sidebar-with-tabs";
import { day, eur, getFunderDashboard, getFunderPitches, listAllDeliveries, listFunders, num, type Funder, type FunderDashboard, type ReceivedPitch } from "@/lib/api";

// Funder side: a dashboard of what they received, the pitches themselves, and an AI chat to question them.
const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "pitches", label: "Pitches", icon: Inbox },
  { id: "ai", label: "AI", icon: Sparkles },
];

function investorNav(id: string) {
  if (id === "analyst" || id === "research") return "ai";
  return id;
}

function NavBridge({ bind }: { bind: (go: (navId: string) => void) => void }) {
  const { setActiveNav } = useTabs();
  bind(setActiveNav);
  return null;
}

const FUNDER_KEY = "bina-funder-id";

export function InvestorDashboard({ entryNav, matterId: entryCase }: { entryNav?: string; matterId?: string }) {
  const [funders, setFunders] = useState<Funder[]>([]);
  const [funderId, setFunderId] = useState("");
  const [pitches, setPitches] = useState<ReceivedPitch[] | null>(null);
  const [caseId, setCaseId] = useState(entryCase ?? "");
  const [chatCase, setChatCase] = useState(entryCase ?? "");
  const go = useRef<(navId: string) => void>(() => {});
  const [pitchCounts, setPitchCounts] = useState<Map<string, number>>(new Map());

  // No login: the funder is picked here. Funders who received pitches are listed first.
  useEffect(() => {
    Promise.all([listFunders(), listAllDeliveries()]).then(([all, deliveries]) => {
      const counts = new Map<string, number>();
      for (const d of deliveries) counts.set(d.funder_id, (counts.get(d.funder_id) ?? 0) + 1);
      const sorted = [...all].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.name.localeCompare(b.name));
      setFunders(sorted);
      setPitchCounts(counts);
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(FUNDER_KEY);
      } catch {}
      // Keep the remembered funder only if it has pitches (or nobody has): the desk should not open on an empty inbox.
      const keep = saved && all.some((f) => f.id === saved) && (counts.has(saved) || !counts.size);
      setFunderId(keep ? saved! : (sorted[0]?.id ?? ""));
    });
  }, []);

  useEffect(() => {
    if (!funderId) return;
    try {
      localStorage.setItem(FUNDER_KEY, funderId);
    } catch {}
    getFunderPitches(funderId).then(setPitches).catch(() => setPitches([]));
  }, [funderId]);

  const options = (pitches ?? []).map((p) => ({ id: p.case_id, label: `${p.defendant} · ${day(p.sent_at.slice(0, 10))}` }));
  const currentChat = chatCase || options[0]?.id || "";

  const current = funders.find((f) => f.id === funderId);
  const withPitches = funders.filter((f) => pitchCounts.has(f.id));
  const others = funders.filter((f) => !pitchCounts.has(f.id));
  const picker = (
    <div className="flex flex-wrap items-center gap-3 border-b border-line bg-gradient-to-r from-sky/50 to-transparent px-4 py-2 md:px-6">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">Signed in as</span>
      <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-8 text-sm font-semibold text-paper shadow-[0_1px_0_rgba(23,43,77,0.04)] transition hover:border-gold/40 focus-within:border-gold/60 focus-within:shadow-[0_0_0_3px_rgba(47,95,163,0.12)]">
        <span className="flex size-6 items-center justify-center rounded-full bg-paper font-mono text-[10px] text-white">{current?.name.slice(0, 1) ?? "?"}</span>
        {current?.name ?? "Choose a funder"}
        {current && pitchCounts.get(current.id) ? (
          <span className="rounded-full bg-sky px-1.5 font-mono text-[10px] font-normal text-gold-2">{pitchCounts.get(current.id)} pitch{pitchCounts.get(current.id)! > 1 ? "es" : ""}</span>
        ) : null}
        <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-faint" />
        <select value={funderId} onChange={(e) => setFunderId(e.target.value)} aria-label="Signed in as" className="absolute inset-0 cursor-pointer opacity-0">
          {withPitches.length ? (
            <optgroup label="Received pitches">
              {withPitches.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({pitchCounts.get(f.id)})
                </option>
              ))}
            </optgroup>
          ) : null}
          <optgroup label="Other funders">
            {others.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <span className="text-[12px] text-faint">Demo: no login</span>
    </div>
  );

  return (
    <SidebarWithTabs
      companyName="Bina.ai"
      storageKey="bina-funder-tabs-v3"
      navItems={navItems}
      mapNavId={investorNav}
      entryNav={entryNav ? investorNav(entryNav) : entryCase ? "pitches" : undefined}
      defaultNavId="dashboard"
      renderContent={(navId) => (
        <>
          <NavBridge bind={(fn) => { go.current = fn; }} />
          {picker}
          {navId === "dashboard" ? (
            <Dashboard
              funderId={funderId}
              onOpen={(id) => {
                setCaseId(id);
                go.current("pitches");
              }}
            />
          ) : null}
          {navId === "pitches" ? (
            caseId ? (
              <div>
                <CaseFile key={caseId} caseId={caseId} mode="investor" onBack={() => setCaseId("")} />
                <div className="mx-auto max-w-6xl px-4 pb-10 md:px-6">
                  <button
                    type="button"
                    onClick={() => {
                      setChatCase(caseId);
                      go.current("ai");
                    }}
                    className="h-10 cursor-pointer rounded-xl bg-fill px-4 text-sm font-semibold text-white hover:bg-fill-2"
                  >
                    Question this pitch with AI
                  </button>
                </div>
              </div>
            ) : (
              <PitchList
                pitches={pitches}
                onOpen={setCaseId}
                onAsk={(id) => {
                  setChatCase(id);
                  go.current("ai");
                }}
              />
            )
          ) : null}
          {navId === "ai" ? (
            <div className="h-[calc(100%-45px)]">
              <AgentPanel
                options={options}
                value={currentChat}
                onChange={setChatCase}
                empty="No pitch received yet."
              />
            </div>
          ) : null}
        </>
      )}
      footer={
        <div className="min-w-0">
          <p className="text-xs text-faint">Funder desk</p>
          <Link href="/desk" className="text-sm font-medium text-gold">
            Association desk
          </Link>
        </div>
      }
    />
  );
}

const SCORES: [string, string][] = [["value", "Value"], ["victims", "Victims"], ["defendant", "Defendant"], ["harm", "Harm"], ["timeline", "Timeline"]];

function PitchList({ pitches, onOpen, onAsk }: { pitches: ReceivedPitch[] | null; onOpen: (caseId: string) => void; onAsk: (caseId: string) => void }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <PageHeader eyebrow="Inbox" title="Pitches received" description="Funding briefs associations sent you. Every fact is traceable to the CNIL decision." />
      {!pitches ? <p className="mt-6 text-sm text-muted">Loading…</p> : null}
      {pitches && !pitches.length ? <p className="card mt-6 p-5 text-sm text-muted">No pitch received yet. Associations send funding briefs from their desk.</p> : null}
      <ul className="mt-6 space-y-4">
        {pitches?.map((p, i) => (
          <li key={p.id} className={`card rise rise-${Math.min(i + 1, 4)} overflow-hidden`}>
            <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                    {p.decision ? `${p.decision.authority} · ${p.decision.reference.replace(/^Délibération (de la formation restreinte )?/, "")}` : "CNIL decision"}
                  </p>
                  <h2 className="mt-1 font-serif text-2xl text-paper">{p.action_name ?? p.defendant}</h2>
                  <p className="mt-0.5 text-[13px] text-muted">From {p.association ?? "an association"}</p>
                </div>
                <span className="shrink-0 rounded-full bg-sky px-2.5 py-1 text-[12px] font-semibold text-gold-2">Received {day(p.sent_at.slice(0, 10))}</span>
              </div>
              {p.summary ? <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted">{p.summary}</p> : null}

              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-[13px] sm:grid-cols-4">
                <div>
                  <dt className="text-faint">Claim (base)</dt>
                  <dd className="font-semibold tabular-nums text-paper">{eur(p.claim_base_eur)}</dd>
                </div>
                <div>
                  <dt className="text-faint">Range</dt>
                  <dd className="font-semibold tabular-nums text-paper">
                    {eur(p.claim_low_eur)} – {eur(p.claim_high_eur)}
                  </dd>
                </div>
                <div>
                  <dt className="text-faint">Affected</dt>
                  <dd className="font-semibold tabular-nums text-paper">{p.victims ? `${num(p.victims)} ${p.victims_unit ?? ""}` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-faint">Funding sought</dt>
                  <dd className="font-semibold tabular-nums text-paper">{p.funding_sought_eur ? eur(p.funding_sought_eur) : "To be set"}</dd>
                </div>
              </dl>

              {p.scores && Object.keys(p.scores).length ? (
                <div className="mt-4 grid grid-cols-5 gap-2">
                  {SCORES.map(([k, label]) => {
                    const sc = p.scores?.[k];
                    return (
                      <div key={k} className="rounded-xl bg-ink/70 px-2.5 py-2">
                        <div className="flex items-baseline justify-between gap-1">
                          <span className="truncate text-[11px] text-faint">{label}</span>
                          <span className="font-mono text-[13px] font-semibold tabular-nums text-paper">{sc?.score ?? "—"}</span>
                        </div>
                        <div className="mt-1.5 h-1 rounded-full bg-elevated">
                          <div className="h-1 rounded-full bg-gold" style={{ width: `${sc?.score ?? 0}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {p.message ? (
                <blockquote className="mt-4 border-l-2 border-gold/40 pl-3 font-serif text-[15px] italic text-muted">“{p.message}”</blockquote>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-ink/40 px-5 py-3">
              <button type="button" onClick={() => onAsk(p.case_id)} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-elevated px-3 text-sm font-medium text-paper hover:bg-hover">
                <Sparkles className="size-4" /> Ask the AI
              </button>
              <button type="button" onClick={() => onOpen(p.case_id)} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-fill px-3 text-sm font-semibold text-white hover:bg-fill-2">
                Open the brief <ArrowRight className="size-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Dashboard({ funderId, onOpen }: { funderId: string; onOpen: (caseId: string) => void }) {
  const [d, setD] = useState<FunderDashboard | null>(null);
  useEffect(() => {
    if (funderId) getFunderDashboard(funderId).then(setD).catch(() => setD(null));
  }, [funderId]);
  if (!d) return <p className="px-6 py-8 text-sm text-muted">Loading…</p>;

  const tiles: [string, string][] = [
    ["Pitches received", String(d.pitches_received)],
    ["Total claim value (base)", eur(d.total_claim_base_eur)],
    ["People affected", num(d.total_victims)],
  ];
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <PageHeader eyebrow={d.funder.funder_type ?? "Funder"} title={d.funder.name} description="Overview of the pitches you received." />
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {tiles.map(([label, value], i) => (
          <div key={label} className={`rise rise-${i + 1} ${i === 0 ? "rounded-2xl bg-paper p-5 text-white shadow-[0_12px_30px_-12px_rgba(23,43,77,0.6)]" : "card p-5"}`}>
            <p className={`font-mono text-[10px] uppercase tracking-[0.12em] ${i === 0 ? "text-sky" : "text-faint"}`}>{label}</p>
            <p className={`mt-2 font-serif text-4xl tabular-nums ${i === 0 ? "text-white" : "text-paper"}`}>{value}</p>
          </div>
        ))}
      </div>
      {d.pitches_received ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Breakdown title="By defendant solvency" rows={d.by_solvency} />
          <Breakdown title="By category of harm" rows={d.by_category} />
        </div>
      ) : (
        <p className="mt-6 card p-5 text-sm text-muted">No pitch received yet. Associations send funding briefs from their desk.</p>
      )}
      {d.latest.length ? (
        <div className="mt-6">
          <h2 className="eyebrow">Latest pitches</h2>
          <ul className="mt-2 divide-y divide-line card">
            {d.latest.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onOpen(p.case_id)} className="flex w-full cursor-pointer flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-left hover:bg-elevated">
                  <span className="font-serif text-lg text-paper">{p.action_name ?? p.defendant}</span>
                  <span className="inline-flex items-center gap-2 text-[13px] text-muted">
                    Base {eur(p.claim_base_eur)} · solvency {p.solvency ?? "—"} · received {day(p.sent_at.slice(0, 10))}
                    <ArrowRight className="size-4 text-gold" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; n: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="card p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">{title}</p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="flex justify-between gap-3 text-[13px]">
              <span className="text-muted first-letter:uppercase">{r.label}</span>
              <span className="tabular-nums text-paper">{r.n}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-elevated">
              <div className="h-1.5 rounded-full bg-gold" style={{ width: `${(r.n / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
