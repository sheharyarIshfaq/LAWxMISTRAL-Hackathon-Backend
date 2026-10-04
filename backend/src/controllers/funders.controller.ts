import type { Request, Response } from "express";
import { InvalidFunder, listFunders, registerFunder } from "../services/funders.ts";
import { runDiscovery } from "../services/discover.ts";
import { listDeliveries } from "../services/workspace.ts";
import { loadBrief } from "../services/brief.ts";
import { readJson } from "../services/storage.ts";
import { NotFound } from "../services/storage.ts";

// Pitches a funder received: delivery + key figures of the brief.
async function received(funderId: string) {
  const deliveries = await listDeliveries({ funder_id: funderId });
  return Promise.all(
    deliveries.map(async (d) => {
      const b = await loadBrief(d.case_id);
      const base = (b?.value.scenarios.value as any[] | null)?.find((s) => s.name === "base") ?? null;
      return {
        ...d,
        defendant: (b?.header.defendant.value as string | null) ?? d.case_id,
        action_name: (b?.header.action_name.value as string | null) ?? null,
        association: (b?.association.name.value as string | null) ?? null,
        decision: (b?.header.source_decision.value as any) ?? null,
        victims: (b?.victims.number.value as number | null) ?? null,
        victims_unit: b?.victims.number.note ?? null,
        claim_low_eur: (b?.value.scenarios.value as any[] | null)?.find((s) => s.name === "low")?.total_eur ?? null,
        claim_base_eur: base?.total_eur ?? null,
        claim_high_eur: (b?.value.scenarios.value as any[] | null)?.find((s) => s.name === "high")?.total_eur ?? null,
        harm_category: (b?.value.harm_category.value as string | null) ?? null,
        solvency: (b?.defendant.solvency.value as string | null) ?? null,
        funding_sought_eur: (b?.value.funding_sought_eur.value as number | null) ?? null,
        summary: ((await readJson<any>(d.case_id, "case.json").catch(() => null))?.breach?.summary as string | undefined) ?? null,
        scores: Object.fromEntries(Object.entries((b as any)?.scores ?? {}).map(([k, v]: [string, any]) => [k, { score: v.score ?? null, label: v.label ?? null }])),
      };
    })
  );
}

export async function getFunderPitches(req: Request<{ id: string }>, res: Response) {
  if (!(await listFunders()).some((f) => f.id === req.params.id)) throw new NotFound(`No funder ${req.params.id}`);
  res.json(await received(req.params.id));
}

// Funder dashboard: what they received, in figures.
export async function getFunderDashboard(req: Request<{ id: string }>, res: Response) {
  const funder = (await listFunders()).find((f) => f.id === req.params.id);
  if (!funder) throw new NotFound(`No funder ${req.params.id}`);
  const pitches = await received(funder.id);
  const count = (key: "harm_category" | "solvency") =>
    Object.entries(pitches.reduce<Record<string, number>>((acc, p) => ((acc[p[key] ?? "unknown"] = (acc[p[key] ?? "unknown"] ?? 0) + 1), acc), {})).map(([label, n]) => ({ label, n }));
  res.json({
    funder: { id: funder.id, name: funder.name, funder_type: funder.funder_type ?? null },
    pitches_received: pitches.length,
    total_claim_base_eur: pitches.reduce((s, p) => s + (p.claim_base_eur ?? 0), 0),
    total_victims: pitches.reduce((s, p) => s + (p.victims ?? 0), 0),
    by_category: count("harm_category"),
    by_solvency: count("solvency"),
    latest: pitches.slice(0, 5),
  });
}

export async function getFunders(_req: Request, res: Response) {
  res.json(await listFunders());
}

// A funder registers on the platform.
export async function createFunder(req: Request, res: Response) {
  try {
    res.status(201).json(await registerFunder(req.body));
  } catch (err) {
    if (err instanceof InvalidFunder) return res.status(400).json({ error: err.message });
    throw err;
  }
}

// AI agent with web search finds real funders (~20-40 s). Every fact keeps its source URL.
export async function discover(_req: Request, res: Response) {
  const found = await runDiscovery();
  res.json({ discovered: found.length, funders: await listFunders() });
}
