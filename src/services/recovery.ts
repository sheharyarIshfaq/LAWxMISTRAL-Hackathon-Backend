import fs from "node:fs/promises";
import path from "node:path";
import { normalize } from "./quoteCheck.ts";

// One row of the legal team's opt-in table (percentages as written in the table, e.g. 1.4 = 1.4%).
export type OptInRow = {
  category: string;
  low_pct: number | null;
  base_pct: number | null;
  high_pct: number | null;
  expected_pct: number | null;
  std_dev_pts: number | null;
  sources: { low: number[]; base: number[]; high: number[] };
};

export type Assumptions = {
  opt_in_table: OptInRow[];
  compensation_per_victim_eur: number;
  count_contracts_as_persons: boolean;
  funder_share: number;
  competent_court_by_legal_form: Record<string, string>;
  benchmarks_note: string;
};

export type Scenario = {
  name: "low" | "base" | "high";
  opt_in_rate: number; // fraction, 0.04 = 4%
  opt_ins: number;
  compensation_per_victim_eur: number;
  total_eur: number;
  funder_eur: number;
  victims_eur: number;
  sources: number[];
};

export type Recovery = {
  people_affected: number;
  people_affected_unit: string;
  category: string;
  compensation_per_victim_eur: number;
  expected_pct: number | null;
  std_dev_pts: number | null;
  funder_share: number;
  scenarios: Scenario[];
};

export async function loadAssumptions(): Promise<Assumptions> {
  return JSON.parse(await fs.readFile(path.resolve("config/assumptions.json"), "utf8"));
}

export function findRow(a: Assumptions, category: string | null | undefined): OptInRow | null {
  if (!category) return null;
  const c = normalize(category);
  return a.opt_in_table.find((r) => normalize(r.category) === c) ?? null;
}

// All arithmetic happens here, never in the model: people × opt-in rate × € per victim.
export function computeRecovery(people: number | null | undefined, unit: string | null | undefined, category: string | null | undefined, a: Assumptions): Recovery | null {
  const row = findRow(a, category);
  if (typeof people !== "number" || people <= 0 || !row || row.low_pct === null || row.base_pct === null || row.high_pct === null) return null;
  const perVictim = a.compensation_per_victim_eur;
  const scenarios = (["low", "base", "high"] as const).map((name) => {
    const rate = (row[`${name}_pct`] as number) / 100;
    const optIns = Math.round(people * rate);
    const total = optIns * perVictim;
    const funder = Math.round(total * a.funder_share);
    return { name, opt_in_rate: rate, opt_ins: optIns, compensation_per_victim_eur: perVictim, total_eur: total, funder_eur: funder, victims_eur: total - funder, sources: row.sources[name] };
  });
  return {
    people_affected: people,
    people_affected_unit: unit ?? "persons",
    category: row.category,
    compensation_per_victim_eur: perVictim,
    expected_pct: row.expected_pct,
    std_dev_pts: row.std_dev_pts,
    funder_share: a.funder_share,
    scenarios,
  };
}

const eur = (n: number) => "€" + n.toLocaleString("en-US");
const pct = (n: number) => `${+(n * 100).toFixed(3)}%`;

// Markdown table for the text pitch.
export function recoveryTable(r: Recovery, a: Assumptions): string {
  const rows = r.scenarios.map(
    (s) => `| ${s.name[0].toUpperCase() + s.name.slice(1)} | ${r.people_affected.toLocaleString("en-US")} | ${pct(s.opt_in_rate)} | ${s.opt_ins.toLocaleString("en-US")} | ${eur(s.compensation_per_victim_eur)} | **${eur(s.total_eur)}** |`
  );
  const notes = [
    `*Assumption:* opt-in rates for "${r.category}" from the legal team's table of past cases${r.expected_pct !== null ? ` (expected ${r.expected_pct}% ± ${r.std_dev_pts} pts)` : ""}; ${eur(r.compensation_per_victim_eur)} per victim.`,
    `*Assumption:* funder share of ${pct(r.funder_share)} of gross recovery.`,
  ];
  if (r.people_affected_unit !== "persons" && a.count_contracts_as_persons)
    notes.push(`*Assumption:* the CNIL counts ${r.people_affected_unit}, not persons; each one is treated as one person here.`);
  return [`| Scenario | People affected | Opt-in rate | Opt-ins | Per victim | Total |`, `| --- | ---: | ---: | ---: | ---: | ---: |`, ...rows, "", ...notes.map((n) => `- ${n}`)].join("\n");
}
