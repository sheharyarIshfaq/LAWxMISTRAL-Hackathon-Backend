import { loadBrief } from "./brief.ts";
import { decisionInfo } from "./decisionKind.ts";
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
  to_confirm: string[]; // criteria still unknown, to check with the funder
  note: string;
};

// Hard criteria: one "not met" makes the fit weak. Others lower it to partial.
const HARD = new Set(["jurisdiction", "collective_actions", "defendant_type", "funder_type"]);
const KEY = ["funder_type", "jurisdiction", "collective_actions", "case_type"];

// Types in the legal team's list. Law firms are not funders; patent specialists do not fund data-protection claims.
const FUNDER_TYPES = /financeur|hedge fund|fonds d'investissement/i;
const NOT_FUNDERS = /cabinet d'avocats/i;
const OTHER_FIELD = /brevets|propriété intellectuelle/i;
const eurM = (n: number) => `€${(n / 1e6).toFixed(1)}M`;

// Matching is plain code: each criterion compares a fact of the case with a fact of the funder profile.
// Unknown funder facts are "unknown", never assumed. No score, no probability.
export function matchFunder(funder: Funder, c: { claim_base_eur: number | null; claim_low_eur: number | null; legal_form: string | null; case_type: string }): Match {
  const criteria: Criterion[] = [];
  const add = (criterion: string, status: Criterion["status"], detail: string) => criteria.push({ criterion, status, detail });

  const t = funder.funder_type ?? null;
  if (t === null)
    add("funder_type", funder.origin === "platform" ? "met" : "unknown", funder.origin === "platform" ? "Registered as a funder" : funder.origin === "discovered" ? "Found on the web; not confirmed to be a funder" : "Type not stated");
  else if (NOT_FUNDERS.test(t)) add("funder_type", "not_met", `${t}: not a funder`);
  else if (FUNDER_TYPES.test(t)) add("funder_type", "met", t);
  else if (OTHER_FIELD.test(t)) add("funder_type", "not_met", `${t}: specialised in another field`);
  else add("funder_type", "unknown", t);

  if (funder.jurisdictions === null) add("jurisdiction", "unknown", "Countries funded not stated");
  else add("jurisdiction", funder.jurisdictions.includes("FR") ? "met" : "not_met", funder.jurisdictions.includes("FR") ? "Funds cases in France" : `Funds cases in ${funder.jurisdictions.join(", ")}, not France`);

  if (funder.funds_collective_actions === null) add("collective_actions", "unknown", "Not stated whether they fund collective actions");
  else add("collective_actions", funder.funds_collective_actions ? "met" : "not_met", funder.funds_collective_actions ? "Funds collective actions" : "Does not fund collective actions");

  if (funder.case_types === null) add("case_type", "unknown", "Case types not stated");
  else {
    // Consumer funders cover data-protection claims (consumers are the victims); competition claims need a competition funder.
    const fits = (t: string) => t === c.case_type || (c.case_type === "data_protection" && t === "consumer");
    const ok = funder.case_types.some(fits);
    add("case_type", ok ? "met" : "not_met", ok ? `Funds ${funder.case_types.filter(fits).join(" / ").replace("_", " ")} claims` : `Funds ${funder.case_types.join(", ")} claims only`);
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
  // Strong: the key criteria are confirmed and nothing failed. Claim size and public-defendant policy may stay
  // unknown ("to confirm"): unknown is not a failure, and it stays visible. Partial: a key criterion is unknown,
  // or one soft criterion failed. Weak: a hard criterion failed, or two failed.
  // Against a public body, whether the funder accepts public defendants is a key question too.
  const keys = c.legal_form === "public" ? [...KEY, "defendant_type"] : KEY;
  const keyConfirmed = keys.every((k) => criteria.find((x) => x.criterion === k)?.status === "met");
  const fit = notMet.some((x) => HARD.has(x.criterion)) || notMet.length >= 2 ? "weak" : notMet.length === 0 && keyConfirmed ? "strong" : "partial";
  const to_confirm = criteria.filter((c) => c.status === "unknown").map((c) => c.criterion);
  const note =
    funder.origin === "curated"
      ? `From the legal team's list (European Commission study).${funder.web_facts?.length ? ` Also from public web sources: ${funder.web_facts.join(", ").replace(/_/g, " ")} (see sources; not confirmed by the funder).` : ""} Not contacted.`
      : funder.origin === "discovered"
      ? "Found by the platform's AI agent from public web sources (see sources). Facts not confirmed by the funder; not contacted."
      : funder.demo
        ? "Fictional demo profile."
        : "Profile registered on the platform by the funder.";
  return { funder, fit, met, not_met: notMet.length, unknown, to_confirm, criteria, note };
}

const ORDER = { strong: 0, partial: 1, weak: 2 };

const SOURCE_ORDER = { curated: 0, platform: 1, discovered: 2 };

export async function matchesForCase(id: string, limit?: number) {
  const brief = await loadBrief(id);
  if (!brief) throw new NotFound(`${id} has no brief yet`);
  const caseJson = await readJson(id, "case.json");
  const scenarios = (brief.value.scenarios.value as any[] | null) ?? [];
  const facts = {
    claim_base_eur: scenarios.find((s) => s.name === "base")?.total_eur ?? null,
    claim_low_eur: scenarios.find((s) => s.name === "low")?.total_eur ?? null,
    legal_form: caseJson.defendant?.legal_form ?? null,
    case_type: (await decisionInfo(id)).kind === "cnil" ? "data_protection" : "competition",
  };
  const matches = (await listFunders())
    .map((f) => matchFunder(f, facts))
    .sort(
      (a, b) =>
        ORDER[a.fit] - ORDER[b.fit] || b.met - a.met || a.unknown - b.unknown || SOURCE_ORDER[a.funder.origin] - SOURCE_ORDER[b.funder.origin] || a.funder.name.localeCompare(b.funder.name)
    );
  const shown = typeof limit === "number" ? matches.slice(0, limit) : matches;
  return {
    case_id: id,
    claim_base_eur: facts.claim_base_eur,
    total: matches.length,
    counts: { strong: matches.filter((m) => m.fit === "strong").length, partial: matches.filter((m) => m.fit === "partial").length, weak: matches.filter((m) => m.fit === "weak").length },
    matches: shown,
  };
}
