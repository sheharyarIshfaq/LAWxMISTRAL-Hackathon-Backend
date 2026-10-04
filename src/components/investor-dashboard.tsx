"use client";

import { useState } from "react";
import Link from "next/link";
import { Library } from "lucide-react";
import { CaseFile } from "@/components/case-file";
import { CaseList } from "@/components/case-list";
import { SidebarWithTabs, type NavItem } from "@/components/sidebar-with-tabs";

// Investor side: the pitches they receive, each with the brief, the decision summary and the chatbot.
const navItems: NavItem[] = [{ id: "pitches", label: "Pitches", icon: Library }];

const investorNav = () => "pitches";

export function InvestorDashboard({ matterId: entryCase }: { entryNav?: string; matterId?: string }) {
  const [caseId, setCaseId] = useState(entryCase ?? "");

  return (
    <SidebarWithTabs
      companyName="Bina.ai"
      storageKey="bina-investor-tabs-v2"
      navItems={navItems}
      mapNavId={investorNav}
      defaultNavId="pitches"
      renderContent={() =>
        caseId ? <CaseFile key={caseId} caseId={caseId} mode="investor" onBack={() => setCaseId("")} /> : <CaseList mode="investor" onOpen={setCaseId} />
      }
      footer={
        <div className="min-w-0">
          <p className="text-xs text-faint">Investor desk</p>
          <Link href="/desk" className="text-sm font-medium text-gold">
            Association desk
          </Link>
        </div>
      }
    />
  );
}
