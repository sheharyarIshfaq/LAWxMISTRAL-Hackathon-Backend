import { loadBrief } from "./brief.ts";
import { listFunders, type Funder } from "./funders.ts";
import { NotFound, readJson } from "./storage.ts";

export type Criterion = { criterion: string; status: "met" | "not_met" | "unknown"; detail: string };
export type Match = {
  funder: Funder;
  fit: "strong" | "partial" | "weak";
  met: number;
  not_met: number;
  unknown: number;
  criteria: Criterion[];
  note: string;
};

// Hard criteria: one "not met" makes the fit weak. Others lower it to partial.
const HARD = new Set(["jurisdiction", "collective_actions", "defendant_type"]);
const eurM = (n: number) => `€${(n / 1e6).toFixed(1)}M`;

// Matching is plain code: each criterion compares a fact of the case with a fact of the funder profile.
// Unknown funder facts are "unknown", never assumed. No score, no probability.
export function matchFunder(funder: Funder, c: { claim_base_eur: number | null; claim_low_eur: number | null; legal_form: string | null; case_type: string }): Match {
  const criteria: Criterion[] = [];
  const add = (criterion: string, status: Criterion["status"], detail: string) => criteria.push({ criterion, status, detail });

  if (funder.jurisdictions === null) add("jurisdiction", "unknown", "Countries funded not stated");
  else add("jurisdiction", funder.jurisdictions.includes("FR") ? "met" : "not_met", funder.jurisdictions.includes("FR") ? "Funds cases in France" : `Funds cases in ${funder.jurisdictions.join(", ")}, not France`);

  if (funder.funds_collective_actions === null) add("collective_actions", "unknown", "Not stated whether they fund collective actions");
  else add("collective_actions", funder.funds_collective_actions ? "met" : "not_met", funder.funds_collective_actions ? "Funds collective actions" : "Does not fund collective actions");

  if (funder.case_types === null) add("case_type", "unknown", "Case types not stated");
  else {
    const ok = funder.case_types.includes(c.case_type) || funder.case_types.includes("consumer");
    add("case_type", ok ? "met" : "not_met", ok ? `Funds ${funder.case_types.filter((t) => t === c.case_type || t === "consumer").join(" / ").replace("_", " ")} claims` : `Funds ${funder.case_types.join(", ")} claims only`);
  }

  if (funder.min_claim_eur === null || c.claim_base_eur === null) add("claim_size", "unknown", funder.min_claim_eur === null ? "Minimum claim size not stated" : "Claim value not computed yet");
  else add("claim_size", c.claim_base_eur >= funder.min_claim_eur ? "met" : "not_met", `Base claim ${eurM(c.claim_base_eur)} ${c.claim_base_eur >= funder.min_claim_eur ? "≥" : "<"} their minimum ${eurM(funder.min_claim_eur)}`);

  const isPublic = c.legal_form === "public";
  if (!isPublic) add("defendant_type", "met", "Private defendant");
  else if (funder.accepts_public_defendants === null) add("defendant_type", "unknown", "Public defendant; not stated whether they fund claims against public bodies");
  else add("defendant_type", funder.accepts_public_defendants ? "met" : "not_met", funder.accepts_public_defendants ? "Accepts claims against public bodies" : "Does not fund claims against public bodies");

  const met = criteria.filter((x) => x.status === "met").length;
  const notMet = criteria.filter((x) => x.status === "not_met");
  const unknown = criteria.filter((x) => x.status === "unknown").length;
  // Strong only when every criterion is confirmed; anything unknown keeps it partial.
  const fit = notMet.some((x) => HARD.has(x.criterion)) || notMet.length >= 2 ? "weak" : notMet.length === 0 && unknown === 0 ? "strong" : "partial";
  const note =
    funder.origin === "discovered"
      ? "Found by the platform's AI agent from public web sources (see sources). Facts not confirmed by the funder; not contacted."
      : funder.demo
        ? "Fictional demo profile."
        : "Profile registered on the platform by the funder.";
  return { funder, fit, met, not_met: notMet.length, unknown, criteria, note };
}

const ORDER = { strong: 0, partial: 1, weak: 2 };

export async function matchesForCase(id: string): Promise<{ case_id: string; claim_base_eur: number | null; matches: Match[] }> {
  const brief = await loadBrief(id);
  if (!brief) throw new NotFound(`${id} has no brief yet`);
  const caseJson = await readJson(id, "case.json");
  const scenarios = (brief.value.scenarios.value as any[] | null) ?? [];
  const facts = {
    claim_base_eur: scenarios.find((s) => s.name === "base")?.total_eur ?? null,
    claim_low_eur: scenarios.find((s) => s.name === "low")?.total_eur ?? null,
    legal_form: caseJson.defendant?.legal_form ?? null,
    case_type: "data_protection",
  };
  const matches = (await listFunders())
    .map((f) => matchFunder(f, facts))
    .sort((a, b) => ORDER[a.fit] - ORDER[b.fit] || b.met - a.met || a.unknown - b.unknown || a.funder.name.localeCompare(b.funder.name));
  return { case_id: id, claim_base_eur: facts.claim_base_eur, matches };
}
