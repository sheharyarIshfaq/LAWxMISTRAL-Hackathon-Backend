"use client";

import { PageHeader } from "@/components/page-header";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, FolderOpen, Landmark, ScrollText, Send } from "lucide-react";
import { AgentPanel } from "@/components/agent-panel";
import { CaseFile } from "@/components/case-file";
import { CasePicker } from "@/components/case-picker";
import { FunderMatches } from "@/components/funder-matches";
import { RadarFeed } from "@/components/radar-feed";
import { SidebarWithTabs, useTabs, type NavItem } from "@/components/sidebar-with-tabs";
import { ApiError, day, eur, getDeliveries, getPitch, listWorkspace, sendToFunders, type WorkItem } from "@/lib/api";

// Association side: monitoring alerts → Decisions → Cases (brief + own details) → Funders (send) → Agent (questions).
const navItems: NavItem[] = [
  { id: "decisions", label: "Decisions", icon: ScrollText },
  { id: "cases", label: "Cases", icon: FolderOpen },
  { id: "funders", label: "Funders", icon: Landmark },
  { id: "agent", label: "Agent", icon: Bot },
];

// Old routes and saved tabs used other ids.
function ngoNav(id: string) {
  if (id === "radar" || id === "pitches") return "decisions";
  if (id === "generate") return "cases";
  if (id === "investors") return "funders";
  return id;
}

function NavBridge({ bind }: { bind: (go: (navId: string) => void) => void }) {
  const { setActiveNav } = useTabs();
  bind(setActiveNav);
  return null;
}

const caseLabel = (w: WorkItem) => `${w.organisation_type.toLowerCase().replace(/^./, (c) => c.toUpperCase())} · ${day(w.date)}`;

export function NgoDashboard({ entryNav, matterId: entryCase }: { entryNav?: string; matterId?: string }) {
  const [caseId, setCaseId] = useState(entryCase ?? "");
  const [work, setWork] = useState<WorkItem[]>([]);
  const go = useRef<(navId: string) => void>(() => {});
  const reloadWork = useCallback(() => listWorkspace().then(setWork).catch(() => null), []);

  useEffect(() => {
    reloadWork();
  }, [reloadWork]);

  const ready = work.filter((w) => w.case_id);
  const pickerOptions = ready.map((w) => ({ id: w.case_id!, label: caseLabel(w) }));
  const current = caseId || ready[0]?.case_id || "";

  return (
    <SidebarWithTabs
      companyName="Bina.ai"
      storageKey="bina-association-tabs-v3"
      navItems={navItems}
      mapNavId={ngoNav}
      entryNav={entryNav ? ngoNav(entryNav) : entryCase ? "cases" : undefined}
      defaultNavId="decisions"
      renderContent={(navId) => (
        <>
          <NavBridge bind={(fn) => { go.current = fn; }} />
          {navId === "decisions" ? (
            <RadarFeed
              onStarted={(w) => {
                reloadWork();
                setCaseId(w.case_id ?? "");
                go.current("cases");
              }}
            />
          ) : null}
          {navId === "cases" ? (
            caseId ? (
              <CaseFile key={caseId} caseId={caseId} mode="association" onBack={() => setCaseId("")} onSend={() => go.current("funders")} />
            ) : (
              <WorkspaceList work={work} onOpen={setCaseId} onDecisions={() => go.current("decisions")} />
            )
          ) : null}
          {navId === "funders" ? <FundersTab caseId={current} options={pickerOptions} onCase={setCaseId} onOpenCase={() => go.current("cases")} /> : null}
          {navId === "agent" ? (
            <AgentPanel
              title="Ask the decision"
              subtitle="Questions about the decision behind one of your cases."
              options={pickerOptions}
              value={current}
              onChange={setCaseId}
              empty="Start a case from Decisions first."
            />
          ) : null}
        </>
      )}
      footer={
        <div className="min-w-0">
          <p className="text-xs text-faint">Association desk</p>
          <Link href="/book" className="text-sm font-medium text-gold">
            Funder desk
          </Link>
        </div>
      }
    />
  );
}

function WorkspaceList({ work, onOpen, onDecisions }: { work: WorkItem[]; onOpen: (caseId: string) => void; onDecisions: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <PageHeader eyebrow="Your workspace" title="Cases" description="The decisions you chose to work on. Open one to complete, finalize and send the funding brief." />
      {!work.length ? (
        <div className="mt-6 card p-5 text-sm text-muted">
          No case yet.{" "}
          <button type="button" onClick={onDecisions} className="cursor-pointer font-medium text-gold">
            Pick a decision to work on
          </button>
          .
        </div>
      ) : null}
      <ul className="mt-5 space-y-3">
        {work.map((w) => (
          <li key={w.radar_id}>
            {w.case_id ? (
              <button type="button" onClick={() => onOpen(w.case_id!)} className="w-full cursor-pointer card p-4 text-left hover:bg-elevated">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-serif text-xl capitalize text-paper">{w.organisation_type.toLowerCase()}</h2>
                  <span className="text-[13px] text-faint">CNIL · {day(w.date)}</span>
                </div>
                <p className="mt-1 text-sm text-muted">Fine {eur(w.fine_eur)} · brief ready</p>
              </button>
            ) : (
              <div className="card p-4 opacity-80">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-serif text-xl capitalize text-paper">{w.organisation_type.toLowerCase()}</h2>
                  <span className="text-[13px] text-faint">CNIL · {day(w.date)}</span>
                </div>
                <p className="mt-1 text-sm text-muted">Analysis requested: you will be emailed when the funding brief is ready.</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Pick funders for a case and send the finalized brief (outbox email + delivery).
function FundersTab({
  caseId,
  options,
  onCase,
  onOpenCase,
}: {
  caseId: string;
  options: { id: string; label: string }[];
  onCase: (id: string) => void;
  onOpenCase: () => void;
}) {
  const [finalized, setFinalized] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!caseId) return;
    getPitch(caseId).then(({ brief }) => setFinalized(Boolean(brief.finalized_at))).catch(() => setFinalized(false));
    getDeliveries(caseId).then((d) => setSent(new Set(d.map((x) => x.funder_id)))).catch(() => null);
  }, [caseId]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const send = async () => {
    setBusy(true);
    try {
      const r = await sendToFunders(caseId, [...selected], message);
      setSent(new Set(r.deliveries.map((d) => d.funder_id)));
      setSelected(new Set());
      setStatus(`Brief sent to ${r.sent.map((d) => d.funder_name).join(", ") || "no new funder"}.`);
    } catch (e) {
      setStatus((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <PageHeader
        eyebrow="Matchmaking"
        title="Funders"
        description="The legal team's list of funders, completed by web search, matched to your case. Select the ones to send the brief to."
      >
        <CasePicker
          options={options}
          value={caseId}
          onChange={(id) => {
            onCase(id);
            setSelected(new Set());
            setStatus(null);
          }}
        />
      </PageHeader>

      {!caseId ? <p className="mt-6 text-sm text-muted">Start a case from Decisions first.</p> : null}
      {caseId && finalized === false ? (
        <p className="mt-5 rounded-xl bg-[#fef0c7] p-3 text-sm text-[#93370d]">
          Finalize the brief before sending it.{" "}
          <button type="button" onClick={onOpenCase} className="cursor-pointer font-semibold underline">
            Open the case
          </button>
        </p>
      ) : null}

      {caseId ? (
        <>
          <div className="sticky top-0 z-10 mt-5 flex flex-wrap items-end gap-3 card p-3 shadow-sm">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              placeholder="Message to the funders (optional)"
              className="min-w-64 flex-1 resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-gold"
            />
            <button
              type="button"
              onClick={send}
              disabled={!finalized || !selected.size || busy}
              className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-fill px-4 text-sm font-semibold text-white hover:bg-fill-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="size-4" /> {busy ? "Sending…" : `Send brief to ${selected.size || ""} funder${selected.size === 1 ? "" : "s"}`}
            </button>
            {status ? <p className="w-full text-[13px] text-muted">{status}</p> : null}
          </div>
          <div className="mt-4">
            <FunderMatches key={caseId} caseId={caseId} selected={selected} onToggle={toggle} sent={sent} />
          </div>
        </>
      ) : null}
    </div>
  );
}
