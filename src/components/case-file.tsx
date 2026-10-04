"use client";

import { useEffect, useState } from "react";
import { Download, ExternalLink } from "lucide-react";
import { ApiError, briefHtmlUrl, briefPdfUrl, day, eur, getCase, getSummary, num, type CaseJson, type Citation } from "@/lib/api";
import { CaseChat } from "@/components/case-chat";
import { FunderMatches } from "@/components/funder-matches";
import { proseClass, renderMarkdown } from "@/lib/markdown";

type Tab = "brief" | "summary" | "funders" | "ask";

// One case: the funding brief (same as the PDF), the decision summary with § links to Légifrance,
// the matched funders (association side) and the chatbot over the decision.
export function CaseFile({ caseId, mode, onBack }: { caseId: string; mode: "association" | "investor"; onBack?: () => void }) {
  const [tab, setTab] = useState<Tab>("brief");
  const [c, setCase] = useState<CaseJson | null>(null);
  const [summary, setSummary] = useState<{ markdown: string; citations: Citation[]; decision_url: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Parents key this component by caseId, so state starts fresh for each case.
  useEffect(() => {
    getCase(caseId).then(setCase).catch((e: ApiError) => setError(e.message));
    getSummary(caseId).then(setSummary).catch(() => setSummary(null));
  }, [caseId]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "brief", label: "Funding brief" },
    { id: "summary", label: "Decision summary" },
    ...(mode === "association" ? [{ id: "funders" as Tab, label: "Funders" }] : []),
    { id: "ask", label: "Ask the decision" },
  ];
  const unverified = summary?.citations.filter((x) => !x.verified).length ?? 0;

  if (error) return <p className="mx-auto mt-10 max-w-3xl rounded-xl bg-[#fee4e2] p-3 text-sm text-[#b42318]">{error}</p>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6">
      {onBack ? (
        <button type="button" onClick={onBack} className="cursor-pointer text-sm text-faint hover:text-gold">
          ← Back
        </button>
      ) : null}

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[13px] text-faint">
            {c ? `${c.decision.regulator} · ${c.decision.reference} · ${day(c.decision.date)}` : "Loading…"}
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight text-paper">{c?.defendant.name ?? caseId}</h1>
          {c ? (
            <p className="mt-2 text-sm text-muted">
              Fine {eur(c.decision.fine_total_eur)} · {num(c.breach.people_affected)} {c.breach.people_affected_unit} affected · GDPR art.{" "}
              {c.violations.map((v) => v.gdpr_article).join(", ")}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={briefPdfUrl(caseId)} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-fill px-3 text-sm font-semibold text-white hover:bg-fill-2">
            <Download className="size-4" /> Brief PDF
          </a>
          {summary?.decision_url ? (
            <a
              href={summary.decision_url}
              target="_blank"
              rel="noopener"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-elevated px-3 text-sm font-medium hover:bg-hover"
            >
              Légifrance <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-1 border-b border-line pb-2" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`h-8 cursor-pointer rounded-full px-3 text-[13px] font-medium ${tab === t.id ? "bg-paper text-white" : "text-muted hover:bg-elevated"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "brief" ? (
          <iframe title="Funding brief" src={briefHtmlUrl(caseId)} className="h-[1180px] w-full rounded-xl border border-line bg-white" />
        ) : null}

        {tab === "summary" ? (
          summary ? (
            <article className="rounded-xl bg-panel p-6">
              <p className="mb-4 text-[13px] text-faint">
                Every fact cites the paragraph (§) of the decision; each link opens Légifrance with the passage highlighted (scroll down to it). Each citation was
                checked against the decision text by code{unverified ? `: ${unverified} of ${summary.citations.length} could not be verified and are marked ⚠` : ""}.
              </p>
              <div className={proseClass} dangerouslySetInnerHTML={{ __html: renderMarkdown(summary.markdown) }} />
            </article>
          ) : (
            <p className="text-sm text-muted">No summary for this case yet.</p>
          )
        ) : null}

        {tab === "funders" ? <FunderMatches caseId={caseId} /> : null}
        {tab === "ask" ? <CaseChat key={caseId} caseId={caseId} defendant={c?.defendant.name ?? ""} /> : null}
      </div>
    </div>
  );
}
