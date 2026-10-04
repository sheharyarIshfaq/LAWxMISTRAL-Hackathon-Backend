"use client";

import { PageHeader } from "@/components/page-header";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Inbox, LayoutDashboard, Sparkles } from "lucide-react";
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

  // No login: the funder is picked here. Funders who received pitches are listed first.
  useEffect(() => {
    Promise.all([listFunders(), listAllDeliveries()]).then(([all, deliveries]) => {
      const receivers = new Set(deliveries.map((d) => d.funder_id));
      const sorted = [...all].sort((a, b) => Number(receivers.has(b.id)) - Number(receivers.has(a.id)) || a.name.localeCompare(b.name));
      setFunders(sorted);
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(FUNDER_KEY);
      } catch {}
      setFunderId(saved && all.some((f) => f.id === saved) ? saved : (sorted[0]?.id ?? ""));
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

  const picker = (
    <div className="border-b border-line bg-gradient-to-r from-sky/50 to-transparent px-4 py-2.5 md:px-6">
      <label className="flex flex-wrap items-center gap-2 text-[13px] text-faint">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em]">Signed in as</span>
        <select value={funderId} onChange={(e) => setFunderId(e.target.value)} className="h-8 max-w-xs rounded-lg border border-line bg-white px-2 text-sm text-paper">
          {funders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <span>(demo: no login)</span>
      </label>
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
              <PitchList pitches={pitches} onOpen={setCaseId} />
            )
          ) : null}
          {navId === "ai" ? (
            <div className="h-[calc(100%-45px)]">
              <AgentPanel
                title="Question a pitch"
                subtitle="Question the CNIL decision behind a pitch you received."
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

function PitchList({ pitches, onOpen }: { pitches: ReceivedPitch[] | null; onOpen: (caseId: string) => void }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <PageHeader eyebrow="Inbox" title="Pitches received" description="Funding briefs associations sent you. Every fact is traceable to the CNIL decision." />
      {!pitches ? <p className="mt-6 text-sm text-muted">Loading…</p> : null}
      {pitches && !pitches.length ? <p className="mt-6 card p-5 text-sm text-muted">No pitch received yet.</p> : null}
      <ul className="mt-5 space-y-3">
        {pitches?.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onOpen(p.case_id)} className="w-full cursor-pointer card p-4 text-left hover:bg-elevated">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-serif text-xl text-paper">{p.defendant}</h2>
                <span className="text-[13px] text-faint">Received {day(p.sent_at.slice(0, 10))}</span>
              </div>
              <p className="mt-1 text-sm text-muted">
                From {p.association ?? "an association"} · {p.decision?.reference ?? "CNIL decision"}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
                <span>
                  <span className="text-faint">Claim </span>
                  <span className="font-semibold text-paper">
                    {eur(p.claim_low_eur)} / {eur(p.claim_base_eur)} / {eur(p.claim_high_eur)}
                  </span>
                </span>
                {p.solvency ? (
                  <span>
                    <span className="text-faint">Solvency </span>
                    <span className="font-semibold capitalize text-paper">{p.solvency}</span>
                  </span>
                ) : null}
                {p.funding_sought_eur ? (
                  <span>
                    <span className="text-faint">Funding sought </span>
                    <span className="font-semibold text-paper">{eur(p.funding_sought_eur)}</span>
                  </span>
                ) : null}
              </div>
              {p.message ? <p className="mt-2 text-[13px] italic text-muted">“{p.message}”</p> : null}
            </button>
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
          <h2 className="text-sm font-semibold text-paper">Latest pitches</h2>
          <ul className="mt-2 divide-y divide-line card">
            {d.latest.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onOpen(p.case_id)} className="flex w-full cursor-pointer flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-left hover:bg-elevated">
                  <span className="font-medium text-paper">{p.defendant}</span>
                  <span className="text-[13px] text-muted">
                    Base {eur(p.claim_base_eur)} · {p.solvency ?? "—"} · received {day(p.sent_at.slice(0, 10))}
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
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{title}</p>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="flex justify-between gap-3 text-[13px]">
              <span className="capitalize text-muted">{r.label}</span>
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
