import fs from "node:fs/promises";
import path from "node:path";

export type Assumptions = {
  opt_in_rate: { low: number; mid: number; high: number };
  compensation_per_person_eur: Record<string, number>;
  multiple_data_types_rule: "highest" | "sum";
  count_contracts_as_persons: boolean;
  funder_share: number;
};

export type Scenario = { name: "low" | "mid" | "high"; opt_in_rate: number; gross_eur: number; funder_eur: number; victims_eur: number };

export type Recovery = {
  people_affected: number;
  people_affected_unit: string;
  compensation_per_person_eur: number;
  compensation_basis: string[];
  funder_share: number;
  scenarios: Scenario[];
};

export async function loadAssumptions(): Promise<Assumptions> {
  return JSON.parse(await fs.readFile(path.resolve("config/assumptions.json"), "utf8"));
}

// All arithmetic happens here, never in the model.
export function computeRecovery(caseJson: any, a: Assumptions): Recovery | null {
  const people = caseJson.breach?.people_affected;
  if (typeof people !== "number" || people <= 0) return null;

  const rated = (caseJson.breach?.data_types ?? []).filter((t: string) => t in a.compensation_per_person_eur);
  const rates = rated.map((t: string) => a.compensation_per_person_eur[t]);
  if (!rates.length) return null;
  const perPerson = a.multiple_data_types_rule === "sum" ? rates.reduce((s: number, r: number) => s + r, 0) : Math.max(...rates);
  const basis = a.multiple_data_types_rule === "sum" ? rated : rated.filter((t: string) => a.compensation_per_person_eur[t] === perPerson);

  const scenarios = (["low", "mid", "high"] as const).map((name) => {
    const gross = Math.round(people * a.opt_in_rate[name] * perPerson);
    const funder = Math.round(gross * a.funder_share);
    return { name, opt_in_rate: a.opt_in_rate[name], gross_eur: gross, funder_eur: funder, victims_eur: gross - funder };
  });

  return {
    people_affected: people,
    people_affected_unit: caseJson.breach.people_affected_unit,
    compensation_per_person_eur: perPerson,
    compensation_basis: basis,
    funder_share: a.funder_share,
    scenarios,
  };
}

const eur = (n: number) => "€" + n.toLocaleString("en-US");
const pct = (n: number) => `${+(n * 100).toFixed(2)}%`;

export function recoveryTable(r: Recovery, a: Assumptions): string {
  const unit = r.people_affected_unit === "persons" ? "persons" : `${r.people_affected_unit}`;
  const rows = r.scenarios.map(
    (s) => `| ${s.name[0].toUpperCase() + s.name.slice(1)} | ${r.people_affected.toLocaleString("en-US")} | ${pct(s.opt_in_rate)} | ${eur(r.compensation_per_person_eur)} | **${eur(s.gross_eur)}** | ${eur(s.funder_eur)} | ${eur(s.victims_eur)} |`
  );
  const notes = [
    `*Assumption:* opt-in rates and compensation per person (${eur(r.compensation_per_person_eur)}, based on leaked data type: ${r.compensation_basis.join(", ")}) are placeholders set by the association's lawyers, not figures from the decision.`,
    `*Assumption:* funder share of ${pct(r.funder_share)} of gross recovery.`,
  ];
  if (unit !== "persons" && a.count_contracts_as_persons)
    notes.push(`*Assumption:* the CNIL counts ${unit}, not persons; each one is treated as one person here.`);
  return [
    `| Scenario | People affected | Opt-in rate | Per person | Gross recovery | Funder share | To victims |`,
    `| --- | ---: | ---: | ---: | ---: | ---: | ---: |`,
    ...rows,
    "",
    ...notes.map((n) => `- ${n}`),
  ].join("\n");
}
