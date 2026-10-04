"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FolderOpen, Landmark, Radar } from "lucide-react";
import { CaseFile } from "@/components/case-file";
import { CaseList } from "@/components/case-list";
import { FunderMatches } from "@/components/funder-matches";
import { RadarFeed } from "@/components/radar-feed";
import { SidebarWithTabs, useTabs, type NavItem } from "@/components/sidebar-with-tabs";
import { listCases, type CaseListItem } from "@/lib/api";

// Association side of the flow: 1. radar → 2-3. case (summary + funding brief) → 4. matching funders.
const navItems: NavItem[] = [
  { id: "radar", label: "Radar", icon: Radar },
  { id: "cases", label: "Cases", icon: FolderOpen },
  { id: "funders", label: "Funders", icon: Landmark },
];

// Old routes and saved tabs used other ids.
function ngoNav(id: string) {
  if (id === "pitches" || id === "generate") return "cases";
  if (id === "investors" || id === "agent") return "funders";
  return id;
}

function NavBridge({ bind }: { bind: (go: (navId: string) => void) => void }) {
  const { setActiveNav } = useTabs();
  bind(setActiveNav);
  return null;
}

export function NgoDashboard({ entryNav, matterId: entryCase }: { entryNav?: string; matterId?: string }) {
  const [caseId, setCaseId] = useState(entryCase ?? "");
  const go = useRef<(navId: string) => void>(() => {});
  const openCase = (id: string) => {
    setCaseId(id);
    go.current("cases");
  };

  return (
    <SidebarWithTabs
      companyName="Bina.ai"
      storageKey="bina-association-tabs-v2"
      navItems={navItems}
      mapNavId={ngoNav}
      entryNav={entryNav ? ngoNav(entryNav) : entryCase ? "cases" : undefined}
      defaultNavId="radar"
      renderContent={(navId) => (
        <>
          <NavBridge bind={(fn) => { go.current = fn; }} />
          {navId === "radar" ? <RadarFeed onOpenCase={openCase} /> : null}
          {navId === "cases" ? (
            caseId ? <CaseFile key={caseId} caseId={caseId} mode="association" onBack={() => setCaseId("")} /> : <CaseList mode="association" onOpen={setCaseId} />
          ) : null}
          {navId === "funders" ? <FundersTab caseId={caseId} onCase={setCaseId} /> : null}
        </>
      )}
      footer={
        <div className="min-w-0">
          <p className="text-xs text-faint">Association desk</p>
          <Link href="/book" className="text-sm font-medium text-gold">
            Investor desk
          </Link>
        </div>
      }
    />
  );
}

// Funders matched to a case; defaults to the first ready case.
function FundersTab({ caseId, onCase }: { caseId: string; onCase: (id: string) => void }) {
  const [cases, setCases] = useState<CaseListItem[]>([]);
  useEffect(() => {
    listCases().then((c) => {
      setCases(c);
      if (!caseId && c[0]) onCase(c[0].id);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-paper">Funders</h1>
          <p className="mt-1 text-[13px] text-faint">The legal team&apos;s list of funders, completed by web search, matched to a case.</p>
        </div>
        {cases.length ? (
          <select value={caseId} onChange={(e) => onCase(e.target.value)} className="h-9 rounded-xl border border-line bg-white px-3 text-sm">
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.defendant ?? c.id}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="mt-5">{caseId ? <FunderMatches caseId={caseId} /> : <p className="text-sm text-muted">Loading…</p>}</div>
    </div>
  );
}
