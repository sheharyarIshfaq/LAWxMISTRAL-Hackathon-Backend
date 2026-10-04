import type { Request, Response } from "express";
import { listCaseIds, readJson, readText, NotFound, type Page } from "../services/storage.ts";

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

export async function getPitch(req: Request<CaseParams>, res: Response) {
  res.json({ markdown: await readText(req.params.id, "pitch.md") });
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
