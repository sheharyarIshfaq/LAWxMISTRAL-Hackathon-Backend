import type { Request, Response } from "express";
import { listCaseIds, readJson, readJsonOr, readText, writeJson, NotFound, type Page } from "../services/storage.ts";
import { applyEdits, EditRejected, type Brief } from "../services/brief.ts";
import { printPdf, renderReportHtml } from "../services/report.ts";

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

// The generated brief with the association's edits (stored separately in brief-edits.json) applied on top.
async function loadBrief(id: string): Promise<Brief | null> {
  const brief = await readJsonOr<Brief | null>(id, "brief.json", null);
  if (!brief) return null;
  const edits = await readJsonOr<Record<string, unknown>>(id, "brief-edits.json", {});
  return Object.keys(edits).length ? applyEdits(brief, edits) : brief;
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
  res.json({ brief: await loadBrief(id) });
}

export async function getSummary(req: Request<CaseParams>, res: Response) {
  const { sentences } = await readJson(req.params.id, "summary.json");
  res.json({ sentences });
}

// The funding brief as a PDF (brief + summary + verification appendix), with the association's edits.
export async function getBriefPdf(req: Request<CaseParams>, res: Response) {
  const { id } = req.params;
  const brief = await loadBrief(id);
  if (!brief) throw new NotFound(`${id} has no brief yet`);
  const summary = await readJsonOr(id, "summary.json", null);
  const html = await renderReportHtml(brief, summary, { decisionFile: `decisions/${id}.pdf` });
  const { pdfPath } = await printPdf(html, `reports/${id}-funding-brief.pdf`);
  res.download(pdfPath, `${id}-funding-brief.pdf`);
}

export async function getScorecard(req: Request<CaseParams>, res: Response) {
  const { claims, scores, red_flags, summary, mock } = await readJson(req.params.id, "scorecard.json");
  res.json({ claims, scores, red_flags, summary, mock: Boolean(mock) });
}

export async function getPage(req: Request<PageParams>, res: Response) {
  const pages = await readJson<Page[]>(req.params.id, "pages.json");
  const page = pages.find((p) => p.page === Number(req.params.n));
  if (!page) throw new NotFound(`Page ${req.params.n} not found`);
  res.json({ page: page.page, text: page.text });
}

export function chat(_req: Request<CaseParams>, res: Response) {
  res.status(501).json({ error: "Chat not implemented yet" });
}

export function createCase(_req: Request, res: Response) {
  res.status(501).json({ error: "Pipeline not implemented yet" });
}
