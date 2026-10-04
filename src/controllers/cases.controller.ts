import type { Request, Response } from "express";
import { listCaseIds, readJson, readJsonOr, readText, writeJson, NotFound, type Page } from "../services/storage.ts";
import { applyEdits, EditRejected, loadBrief } from "../services/brief.ts";
import { findRow, loadAssumptions } from "../services/recovery.ts";
import { chat as chatWithDecision } from "../services/chat.ts";
import { platformAssessment, runCheck, type Scorecard } from "../services/scorecard.ts";
import { printPdf, renderReportHtml } from "../services/report.ts";
import { decisionUrl, renderCitations, type Summary } from "../services/summary.ts";

type CaseParams = { id: string };
type PageParams = { id: string; n: string };

export async function listCases(_req: Request, res: Response) {
  const cases = await Promise.all(
    (await listCaseIds()).map(async (id) => {
      const c = await readJson(id, "case.json");
      return {
        id,
        defendant: c.defendant?.name ?? null,
        date: c.decision?.date ?? null,
        fine_total_eur: c.decision?.fine_total_eur ?? null,
        people_affected: c.breach?.people_affected ?? null,
        data_types: c.breach?.data_types ?? [],
        mock: Boolean(c.mock),
      };
    })
  );
  cases.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  res.json(cases);
}

export async function getCase(req: Request<CaseParams>, res: Response) {
  res.json(await readJson(req.params.id, "case.json"));
}

// The brief plus the platform's locked assessment (from scorecard.json), marked stale if the brief changed since.
async function briefWithAssessment(id: string) {
  const brief = await loadBrief(id);
  if (!brief) return null;
  const sc = await readJsonOr<Scorecard | null>(id, "scorecard.json", null);
  return { ...brief, platform_assessment: sc && "counts" in sc ? platformAssessment(sc, brief) : null };
}

export async function getPitch(req: Request<CaseParams>, res: Response) {
  const [markdown, brief] = await Promise.all([readText(req.params.id, "pitch.md"), briefWithAssessment(req.params.id)]);
  res.json({ brief, markdown });
}

// Body: { edits: { "association.name": "...", "value.funding_sought_eur": 2000000, ... } }
export async function editBrief(req: Request<CaseParams>, res: Response) {
  const { id } = req.params;
  const edits = req.body?.edits;
  if (!edits || typeof edits !== "object" || Array.isArray(edits)) return res.status(400).json({ error: "Body must be { edits: { path: value } }" });
  if ("value.harm_category" in edits) {
    const row = findRow(await loadAssumptions(), edits["value.harm_category"]);
    if (!row) return res.status(400).json({ error: "value.harm_category must be one of the categories of the opt-in table" });
    edits["value.harm_category"] = row.category;
  }
  const brief = await loadBrief(id);
  if (!brief) throw new NotFound(`${id} has no brief yet`);
  try {
    applyEdits(brief, edits); // validates every path before anything is saved
  } catch (err) {
    if (err instanceof EditRejected) return res.status(400).json({ error: err.message });
    throw err;
  }
  const saved = await readJsonOr<Record<string, unknown>>(id, "brief-edits.json", {});
  await writeJson(id, "brief-edits.json", { ...saved, ...edits, _edited_at: new Date().toISOString() });
  res.json({ brief: await briefWithAssessment(id) });
}

export async function getSummary(req: Request<CaseParams>, res: Response) {
  const { id } = req.params;
  const summary = await readJson<Summary>(id, "summary.json");
  const url = await decisionUrl(id);
  // Links go to the official Légifrance page (scrolling to the passage) when its URL is known, else to the local PDF page.
  res.json({ markdown: renderCitations(summary, { url, localPdf: `/decisions/${id}.pdf` }), citations: summary.citations, decision_url: url });
}

// The funding brief as a PDF (brief, platform assessment, summary), with the association's edits.
export async function getBriefPdf(req: Request<CaseParams>, res: Response) {
  const { id } = req.params;
  // Funder check (platform assessment) left out of the PDF for now.
  const brief = await loadBrief(id);
  if (!brief) throw new NotFound(`${id} has no brief yet`);
  const summary = await readJsonOr<Summary | null>(id, "summary.json", null);
  const url = await decisionUrl(id);
  const html = await renderReportHtml(brief, summary ? renderCitations(summary, { url, plain: !url }) : null);
  const { pdfPath } = await printPdf(html, `reports/${id}-funding-brief.pdf`);
  res.download(pdfPath, `${id}-funding-brief.pdf`);
}

export async function getScorecard(req: Request<CaseParams>, res: Response) {
  const { id } = req.params;
  const sc = await readJson(id, "scorecard.json");
  const brief = await loadBrief(id);
  const { claims, scores, red_flags, summary, counts = null, ratings = null, checked_at = null, mock } = sc;
  const stale = brief && "brief_edited_at" in sc ? (sc.brief_edited_at ?? null) !== (brief.edited_at ?? null) : false;
  res.json({ claims, scores, red_flags, summary, counts, ratings, checked_at, stale, mock: Boolean(mock) });
}

// Re-runs the funder check (one model call, ~15-30 s), e.g. after the association edited the brief.
export async function checkCase(req: Request<CaseParams>, res: Response) {
  const sc = await runCheck(req.params.id);
  res.json({ ...sc, stale: false });
}

export async function getPage(req: Request<PageParams>, res: Response) {
  const pages = await readJson<Page[]>(req.params.id, "pages.json");
  const page = pages.find((p) => p.page === Number(req.params.n));
  if (!page) throw new NotFound(`Page ${req.params.n} not found`);
  res.json({ page: page.page, text: page.text });
}

// Body: { question, history?: [{ role: "user" | "assistant", content }] }. Answers only from the decision, quotes checked.
export async function chat(req: Request<CaseParams>, res: Response) {
  const { question, history } = req.body ?? {};
  if (typeof question !== "string" || !question.trim()) return res.status(400).json({ error: "Body must be { question, history? }" });
  if (history !== undefined && !Array.isArray(history)) return res.status(400).json({ error: "history must be an array of { role, content }" });
  res.json(await chatWithDecision(req.params.id, question.trim(), history ?? []));
}

export function createCase(_req: Request, res: Response) {
  res.status(501).json({ error: "Pipeline not implemented yet" });
}
