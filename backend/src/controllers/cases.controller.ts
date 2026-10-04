import type { Request, Response } from "express";
import { listCaseIds, readJson, readJsonOr, readText, writeJson, NotFound, type Page } from "../services/storage.ts";
import { applyEdits, EditRejected, loadBrief } from "../services/brief.ts";
import { findRow, loadAssumptions } from "../services/recovery.ts";
import { chat as chatWithDecision, chatStream as streamChatWithDecision } from "../services/chat.ts";
import { matchesForCase } from "../services/matching.ts";
import { listDeliveries, sendBrief, WorkflowError } from "../services/workspace.ts";
import { printPdf, renderReportHtml } from "../services/report.ts";
import { decisionUrl, renderCitations, type Summary } from "../services/summary.ts";
import { legifranceLink } from "../services/legifrance.ts";
import { buildParagraphs } from "../services/paragraphs.ts";

type CaseParams = { id: string };
type PageParams = { id: string; n: string };

// A case is demo-ready when its brief, summary and category of harm exist.
async function isReady(id: string): Promise<boolean> {
  const [brief, summary, category] = await Promise.all(["brief.json", "summary.json", "category.json"].map((f) => readJsonOr(id, f, null)));
  return Boolean(brief && summary && category);
}

// Default: demo-ready cases only. ?all=true also lists the mock and partly processed cases.
export async function listCases(req: Request, res: Response) {
  const all = req.query.all === "true";
  const ids = [];
  for (const id of await listCaseIds()) if (all || (await isReady(id))) ids.push(id);
  const cases = await Promise.all(
    ids.map(async (id) => {
      const c = await readJson(id, "case.json");
      return {
        id,
        defendant: c.defendant?.name ?? null,
        date: c.decision?.date ?? null,
        fine_total_eur: c.decision?.fine_total_eur ?? null,
        people_affected: c.breach?.people_affected ?? null,
        data_types: c.breach?.data_types ?? [],
        mock: Boolean(c.mock),
        ready: await isReady(id),
      };
    })
  );
  cases.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  res.json(cases);
}

export async function getCase(req: Request<CaseParams>, res: Response) {
  res.json(await readJson(req.params.id, "case.json"));
}

export async function getPitch(req: Request<CaseParams>, res: Response) {
  const [markdown, brief] = await Promise.all([readText(req.params.id, "pitch.md"), loadBrief(req.params.id)]);
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
  if (brief.finalized_at) return res.status(400).json({ error: "The brief is finalized. Reopen it to edit." });
  try {
    applyEdits(brief, edits); // validates every path before anything is saved
  } catch (err) {
    if (err instanceof EditRejected) return res.status(400).json({ error: err.message });
    throw err;
  }
  const saved = await readJsonOr<Record<string, unknown>>(id, "brief-edits.json", {});
  await writeJson(id, "brief-edits.json", { ...saved, ...edits, _edited_at: new Date().toISOString() });
  res.json({ brief: await loadBrief(id) });
}

// Citation id → Légifrance link that highlights the passage (null when the decision URL is unknown → plain "(§ N)").
async function citationLinker(id: string): Promise<(citationId: number) => string | null> {
  const [summary, url, pages] = await Promise.all([readJsonOr<Summary | null>(id, "summary.json", null), decisionUrl(id), readJson<Page[]>(id, "pages.json")]);
  const paragraphs = buildParagraphs(pages);
  const byId = new Map((summary?.citations ?? []).map((c) => [c.id, c]));
  return (cid) => {
    const c = byId.get(cid);
    return url && c ? legifranceLink(url, c, paragraphs) : null;
  };
}

export async function getSummary(req: Request<CaseParams>, res: Response) {
  const { id } = req.params;
  const summary = await readJson<Summary>(id, "summary.json");
  const url = await decisionUrl(id);
  // Links go to the official Légifrance page (scrolling to the passage) when its URL is known, else to the local PDF page.
  // Each citation links to the official Légifrance text with the cited passage highlighted.
  const link = await citationLinker(id);
  res.json({
    markdown: renderCitations(summary, { link }),
    citations: summary.citations.map((c) => ({ ...c, url: link(c.id) })),
    decision_url: url,
  });
}

// The funding brief as an HTML page (same layout as the PDF, without the summary) for embedding in the app.
export async function getBriefHtml(req: Request<CaseParams>, res: Response) {
  const brief = await loadBrief(req.params.id);
  if (!brief) throw new NotFound(`${req.params.id} has no brief yet`);
  res.type("html").send(await renderReportHtml(brief, null, { embed: true }));
}

// The funding brief as a PDF (brief, platform assessment, summary), with the association's edits.
export async function getBriefPdf(req: Request<CaseParams>, res: Response) {
  const { id } = req.params;
  // Funder check (platform assessment) left out of the PDF for now.
  const brief = await loadBrief(id);
  if (!brief) throw new NotFound(`${id} has no brief yet`);
  const summary = await readJsonOr<Summary | null>(id, "summary.json", null);
  const url = await decisionUrl(id);
  const html = await renderReportHtml(brief, summary ? renderCitations(summary, { link: await citationLinker(id) }) : null);
  const { pdfPath } = await printPdf(html, `reports/${id}-funding-brief.pdf`);
  res.download(pdfPath, `${id}-funding-brief.pdf`);
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

// Same as chat, streamed as NDJSON (one event per line) so the client sees the steps, the reasoning and the answer live.
export async function chatStream(req: Request<CaseParams>, res: Response) {
  const { question, history } = req.body ?? {};
  if (typeof question !== "string" || !question.trim()) return res.status(400).json({ error: "Body must be { question, history? }" });
  if (history !== undefined && !Array.isArray(history)) return res.status(400).json({ error: "history must be an array of { role, content }" });
  res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  const send = (e: unknown) => res.write(JSON.stringify(e) + "\n");
  try {
    await streamChatWithDecision(req.params.id, question.trim(), history ?? [], send);
  } catch (e) {
    send({ type: "error", message: e instanceof Error ? e.message : "The agent did not answer." });
  }
  res.end();
}

export function createCase(_req: Request, res: Response) {
  res.status(501).json({ error: "Pipeline not implemented yet" });
}

// Funders matched to this case, strong → weak, with the reasons. Plain code, no probability.
// ?limit=N returns the N best matches (default: all).
export async function getMatches(req: Request<CaseParams>, res: Response) {
  const limit = Number(req.query.limit);
  res.json(await matchesForCase(req.params.id, Number.isFinite(limit) && limit > 0 ? limit : undefined));
}

// Finalize (required before sending to funders) or reopen the brief for editing.
async function setFinalized(id: string, value: string | null) {
  const edits = await readJsonOr<Record<string, unknown>>(id, "brief-edits.json", {});
  if (value) edits._finalized_at = value;
  else delete edits._finalized_at;
  await writeJson(id, "brief-edits.json", edits);
  return loadBrief(id);
}
export async function finalizeBrief(req: Request<CaseParams>, res: Response) {
  if (!(await loadBrief(req.params.id))) throw new NotFound(`${req.params.id} has no brief yet`);
  res.json({ brief: await setFinalized(req.params.id, new Date().toISOString()) });
}
export async function reopenBrief(req: Request<CaseParams>, res: Response) {
  res.json({ brief: await setFinalized(req.params.id, null) });
}

// Body: { funder_ids: string[], message?: string }. Sends the finalized brief (outbox email + delivery per funder).
export async function sendToFunders(req: Request<CaseParams>, res: Response) {
  const { funder_ids, message } = req.body ?? {};
  if (!Array.isArray(funder_ids)) return res.status(400).json({ error: "Body must be { funder_ids: [...], message? }" });
  try {
    const sent = await sendBrief(req.params.id, funder_ids.map(String), typeof message === "string" && message.trim() ? message.trim() : null);
    res.json({ sent, deliveries: await listDeliveries({ case_id: req.params.id }) });
  } catch (err) {
    if (err instanceof WorkflowError) return res.status(400).json({ error: err.message });
    throw err;
  }
}

export async function getDeliveries(req: Request<CaseParams>, res: Response) {
  res.json(await listDeliveries({ case_id: req.params.id }));
}
