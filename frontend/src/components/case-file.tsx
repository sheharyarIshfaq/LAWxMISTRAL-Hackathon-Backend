"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, ExternalLink, Send } from "lucide-react";
import {
  ApiError,
  briefHtmlUrl,
  briefPdfUrl,
  day,
  eur,
  finalizeBrief,
  getCase,
  getDeliveries,
  getPitch,
  getSummary,
  num,
  reopenBrief,
  type CaseJson,
  type Citation,
  type Delivery,
} from "@/lib/api";
import { BriefEditor } from "@/components/brief-editor";
import { proseClass, renderMarkdown } from "@/lib/markdown";

type Tab = "brief" | "summary";

// One case: the funding brief (same as the PDF) and the decision summary with § links to Légifrance.
// Association mode adds the editor for its own details, finalization and sending to funders.
export function CaseFile({
  caseId,
  mode,
  onBack,
  onSend,
}: {
  caseId: string;
  mode: "association" | "investor";
  onBack?: () => void;
  onSend?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("brief");
  const [c, setCase] = useState<CaseJson | null>(null);
  const [summary, setSummary] = useState<{ markdown: string; citations: Citation[]; decision_url: string | null } | null>(null);
  const [finalizedAt, setFinalizedAt] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [version, setVersion] = useState(0); // bumps the brief preview after a save
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getPitch(caseId).then(({ brief }) => setFinalizedAt(brief.finalized_at)).catch(() => null);
    if (mode === "association") getDeliveries(caseId).then(setDeliveries).catch(() => null);
  }, [caseId, mode]);

  // Parents key this component by caseId, so state starts fresh for each case.
  useEffect(() => {
    getCase(caseId).then(setCase).catch((e: ApiError) => setError(e.message));
    getSummary(caseId).then(setSummary).catch(() => setSummary(null));
    refresh();
  }, [caseId, refresh]);

  const toggleFinal = async () => {
    try {
      const { brief } = finalizedAt ? await reopenBrief(caseId) : await finalizeBrief(caseId);
      setFinalizedAt(brief.finalized_at);
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as ApiError).message);
    }
  };

  const unverified = summary?.citations.filter((x) => !x.verified).length ?? 0;
  if (error) return <p className="mx-auto mt-10 max-w-3xl rounded-xl bg-[#fee4e2] p-3 text-sm text-[#b42318]">{error}</p>;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      {onBack ? (
        <button type="button" onClick={onBack} className="cursor-pointer text-sm text-faint hover:text-gold">
          ← Back
        </button>
      ) : null}

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[13px] text-faint">{c ? `${c.decision.regulator} · ${c.decision.reference} · ${day(c.decision.date)}` : "Loading…"}</p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight text-paper">{c?.defendant.name ?? caseId}</h1>
          {c ? (
            <p className="mt-2 text-sm text-muted">
              Fine {eur(c.decision.fine_total_eur)} · {num(c.breach.people_affected)} {c.breach.people_affected_unit} affected · GDPR art.{" "}
              {c.violations.map((v) => v.gdpr_article).join(", ")}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={briefPdfUrl(caseId)} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-elevated px-3 text-sm font-medium hover:bg-hover">
            <Download className="size-4" /> Brief PDF
          </a>
          {summary?.decision_url ? (
            <a href={summary.decision_url} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-elevated px-3 text-sm font-medium hover:bg-hover">
              Légifrance <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
      </div>

      {mode === "association" ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 card p-3">
          <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${finalizedAt ? "bg-[#dcfae6] text-[#085d3a]" : "bg-elevated text-muted"}`}>
            {finalizedAt ? `Finalized ${day(finalizedAt.slice(0, 10))}` : "Draft"}
          </span>
          {deliveries.length ? (
            <span className="text-[13px] text-muted">
              Sent to {deliveries.length} funder{deliveries.length > 1 ? "s" : ""}: {deliveries.map((d) => d.funder_name).join(", ")}
            </span>
          ) : (
            <span className="text-[13px] text-faint">Complete your details, finalize, then send the brief to funders.</span>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={toggleFinal} className="h-9 cursor-pointer rounded-xl bg-elevated px-3 text-sm font-medium hover:bg-hover">
              {finalizedAt ? "Reopen for editing" : "Finalize the brief"}
            </button>
            <button
              type="button"
              onClick={onSend}
              disabled={!finalizedAt}
              title={finalizedAt ? "" : "Finalize the brief first"}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-fill px-3 text-sm font-semibold text-white hover:bg-fill-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send className="size-4" /> Send to funders
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-1 border-b border-line pb-2" role="tablist">
        {(
          [
            ["brief", "Funding brief"],
            ["summary", "Decision summary"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`h-8 cursor-pointer rounded-full px-3 text-[13px] font-medium ${tab === id ? "bg-paper text-white" : "text-muted hover:bg-elevated"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "brief" ? (
          <div className={mode === "association" ? "grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]" : ""}>
            <iframe key={version} title="Funding brief" src={`${briefHtmlUrl(caseId)}?v=${version}`} className="h-[1180px] w-full rounded-xl border border-line bg-white" />
            {mode === "association" ? (
              <BriefEditor
                key={finalizedAt ?? "draft"}
                caseId={caseId}
                locked={Boolean(finalizedAt)}
                onSaved={() => {
                  setVersion((v) => v + 1);
                  refresh();
                }}
              />
            ) : null}
          </div>
        ) : null}

        {tab === "summary" ? (
          summary ? (
            <article className="card p-6">
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
      </div>
    </div>
  );
}
