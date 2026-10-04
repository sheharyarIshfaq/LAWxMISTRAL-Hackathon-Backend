import fs from "node:fs/promises";
import path from "node:path";
import { askJson } from "./mistral.ts";
import { addQuoteFlags, requoteFailed } from "./quoteCheck.ts";
import { withPageMarkers } from "./decisionText.ts";
import { computeRecovery, findRow, loadAssumptions, type Assumptions } from "./recovery.ts";
import type { HarmCategory } from "./category.ts";
import { rateSolvency, SOLVENCY_RULE, type Revenue } from "./solvency.ts";
import { readJsonOr, type Page } from "./storage.ts";

// Where each value in the brief comes from. The frontend styles fields by source.
export type Source = "decision" | "assessment" | "computed" | "assumption" | "association" | "web" | "missing";

export type Field<T = unknown> = {
  value: T | null;
  source: Source;
  quote?: string | null;
  page?: number | null;
  quote_verified?: boolean;
  quote_fixed?: "page_corrected" | "repaired" | "trimmed";
  note?: string;
  source_url?: string; // web facts: where the figure comes from
  calc?: Record<string, unknown>; // computed fields: the inputs of the calculation
};

const prompt = (name: string) => fs.readFile(path.resolve("prompts", name), "utf8");

const field = <T>(value: T | null | undefined, source: Source, extra: Partial<Field<T>> = {}): Field<T> => {
  const v = value === undefined || (Array.isArray(value) && !value.length) ? null : value;
  return { value: v, source: v === null && source !== "association" ? "missing" : source, ...extra };
};
const cited = (o: any) => ({ quote: o?.quote ?? null, page: o?.page ?? null, quote_verified: o?.quote_verified ?? false, ...(o?.quote_fixed ? { quote_fixed: o.quote_fixed } : {}) });
const missing = (note = "To be provided") => field(null, "missing", { note });

const BRIEF_FORMAT = `
Output format:
- Return one JSON object with exactly the keys of the schema below. Where the schema shows options separated by "|", output exactly one of them. Lists contain only the values that apply.
- "page" is the number of the nearest [PAGE n] marker before the quoted text. Each quote is one continuous passage copied character for character; do not skip text in brackets, do not use "...", never replace a pronoun with a name.`;

export async function generateBrief(caseJson: any, pages: Page[]) {
  const [system, schema, a] = await Promise.all([prompt("brief.txt"), prompt("brief-schema.json"), loadAssumptions()]);
  const m = await requoteFailed(addQuoteFlags(await askJson(`${system}\n${BRIEF_FORMAT}\n\nSCHEMA:\n${schema}`, withPageMarkers(pages)), pages), pages);
  const c = caseJson;
  const status = c.decision?.under_appeal === true ? "under_appeal" : c.decision?.under_appeal === false ? "final" : null;

  return {
    case_id: c.case_id,
    generated_at: new Date().toISOString(),
    edited_at: null as string | null,
    header: {
      action_name: field(`${c.defendant?.name ?? "Data breach"} data breach action`, "computed"),
      defendant: field(c.defendant?.name, "decision"),
      source_decision: field({ authority: c.decision?.regulator, reference: c.decision?.reference, date: c.decision?.date }, "decision"),
      legal_basis: field(
        (c.violations ?? []).map((v: any) => ({ article: `GDPR art. ${v.gdpr_article}`, label: v.label, ...cited(v) })),
        "decision"
      ),
      status: field(status, "decision", status ? {} : { note: "Appeal status not stated in the decision" }),
    },
    harm: {
      quantified: field(m.harm?.quantified, "assessment", cited(m.harm)),
      nature: field(m.harm?.nature, "assessment", cited(m.harm)),
      description: field(m.harm?.description, "assessment", cited(m.harm)),
    },
    victims: {
      number: field(c.breach?.people_affected, "decision", { ...cited(c.breach), note: c.breach?.people_affected_unit }),
      identifiable: field(m.victims?.identifiable, "assessment", cited(m.victims)),
      categories: field(m.victims?.categories, "assessment", cited(m.victims)),
      proof_of_membership: field(m.victims?.proof_of_membership, "assessment", cited(m.victims)),
      subgroups: field(m.victims?.subgroups?.filter(Boolean), "assessment", cited(m.victims)),
    },
    defendant: {
      name: field(c.defendant?.name, "decision"),
      nature: field(m.defendant?.nature, "assessment", cited(m.defendant)),
      solvency: field(m.defendant?.solvency, "assessment", { ...cited(m.defendant), note: m.defendant?.solvency_reason ?? undefined }),
      revenue: field(
        m.defendant?.revenue_eur ? { amount_eur: m.defendant.revenue_eur, entity: m.defendant.revenue_entity, year: m.defendant.revenue_year } : null,
        "decision",
        cited(m.defendant)
      ),
      group: field(m.defendant?.group, "decision", cited(m.defendant)),
      current_revenue: missing("Latest revenue not looked up yet") as Field<any>, // filled on read from revenue.json
      insurance: missing("Not stated in the decision"),
      competent_court: field((a as any).competent_court_by_legal_form?.[c.defendant?.legal_form], "assumption"),
    },
    // Rebuilt on every read by withValue(): opt-in table row, rates and totals come from config + category.json.
    value: valueSection(null, a),
    timeline: {
      expected_duration_years: missing(),
      limitation_ends: missing("To be confirmed by counsel"),
      facts: field(m.facts?.start || m.facts?.end ? { start: m.facts.start, end: m.facts.end } : null, "decision", cited(m.facts)),
      source_decision: field(c.decision?.date, "decision"),
      filing: missing("Target date"),
      judgment_on_liability: missing("Estimate"),
      victims_opt_in: missing("Period"),
      compensation_paid: missing("Estimate"),
    },
    association: {
      name: missing(),
      certified_since: missing(),
      statutory_purpose_url: missing(),
      counsel: missing(),
      contact: missing(),
    },
    framework: {
      no_funder_influence: field(false, "association", { note: "To be confirmed by the association" }),
      funding_publicly_disclosed: field(false, "association", { note: "To be confirmed by the association" }),
      conflict_of_interest_policy: field(false, "association", { note: "To be confirmed by the association" }),
      funder_has_no_ties_to_defendant: field(false, "association", { note: "To be confirmed by the association" }),
    },
  };
}

export type Brief = Awaited<ReturnType<typeof generateBrief>>;

// "Value of the claim": the model only chose the table row (category.json); every number comes from config, in code.
function valueSection(cat: HarmCategory | null, a: Assumptions) {
  return {
    formula: "Total = victims who opt in × compensation per victim",
    harm_category: cat?.category
      ? field(cat.category, "assessment", { quote: cat.quote, page: cat.page, quote_verified: cat.quote_verified, ...(cat.quote_fixed ? { quote_fixed: cat.quote_fixed as any } : {}), note: `${cat.reason} Chosen by rule: ${cat.rule ?? "most conservative matching row"}.` })
      : missing("Category of harm not classified yet"),
    // Every row the decision supports (model: reason + quote), turned into alternatives with totals in computeValue.
    category_alternatives: (cat?.matches?.length ? field(cat.matches, "assessment") : missing("No other category")) as Field<any>,
    scenarios: missing("Cannot be computed") as Field<any>,
    opt_in_expected: missing("Cannot be computed") as Field<any>,
    compensation_per_victim_eur: field(a.compensation_per_victim_eur, "assumption", { note: "Legal team" }),
    funding_sought_eur: missing("To be set by the association"),
    funder_share: field(a.funder_share, "assumption"),
    benchmarks_note: field(a.benchmarks_note, "assumption"),
  };
}

function revenueField(r: Revenue | null): Field<any> {
  if (!r) return missing("Latest revenue not looked up yet");
  const v = { amount_eur: r.amount_eur, entity: r.entity, year: r.year };
  return r.origin === "web"
    ? field(v, "web", { source_url: r.source?.url, note: `Found by web search: ${r.source?.title ?? r.source?.url}` })
    : field(v, "decision", { note: "Revenue stated in the CNIL decision (no more recent figure found on the web)" });
}

// Legal team's rule: exposure (victims × € per victim × base opt-in) ÷ revenue. Computed, never judged by the model.
function computeSolvency(brief: Brief) {
  const d = brief.defendant as any;
  const base = ((brief.value as any).scenarios.value as any[] | null)?.find((s) => s.name === "base");
  const rv = d.current_revenue.value ?? d.revenue.value;
  const revenueEur = typeof rv === "number" ? rv : rv?.amount_eur;
  if (!base || typeof revenueEur !== "number" || revenueEur <= 0) {
    d.solvency = missing(!base ? "Needs the claim value (category of harm)" : "Needs the defendant's revenue");
    return;
  }
  const { ratio, rating } = rateSolvency(base.total_eur, revenueEur);
  const who = typeof rv === "object" && rv ? `${rv.entity ?? ""}${rv.year ? `, ${rv.year}` : ""}` : "";
  d.solvency = field(rating, "computed", {
    note: `Exposure €${(base.total_eur / 1e6).toFixed(1)}M ÷ revenue €${(revenueEur / 1e9).toFixed(2)}bn${who ? ` (${who})` : ""} = ${(ratio * 100).toFixed(1)}% → ${rating}. Rule: ${SOLVENCY_RULE}.`,
    calc: { exposure_eur: base.total_eur, revenue_eur: revenueEur, ratio: Number(ratio.toFixed(4)), rule: SOLVENCY_RULE },
  });
}

// Fill in the computed scenarios from the (possibly association-edited) category, € per victim and funder share.
function computeValue(brief: Brief, a: Assumptions) {
  const v = brief.value as ReturnType<typeof valueSection>;
  const category = v.harm_category.value as string | null;
  const perVictim = (v.compensation_per_victim_eur.value as number | null) ?? a.compensation_per_victim_eur;
  const share = (v.funder_share.value as number | null) ?? a.funder_share;
  const r = computeRecovery(brief.victims.number.value as number | null, brief.victims.number.note, category, { ...a, compensation_per_victim_eur: perVictim, funder_share: share });
  const row = findRow(a, category);
  v.scenarios = r
    ? field(r.scenarios, "computed", { note: `Opt-in rates from the legal team's table for "${r.category}"; ${r.people_affected_unit !== "persons" ? `the CNIL counts ${r.people_affected_unit}, each treated as one person` : "persons"}.` })
    : missing(category ? (row ? "This category has no opt-in data in the table" : "Category not in the opt-in table") : "Category of harm not classified yet");
  // Alternatives: the other rows the decision supports, with what the claim would be under each (computed here).
  const matches = ((v as any).category_alternatives.value as any[] | null) ?? [];
  const alts = matches
    .filter((m) => m.category !== category)
    .map((m) => {
      const alt = computeRecovery(brief.victims.number.value as number | null, brief.victims.number.note, m.category, { ...a, compensation_per_victim_eur: perVictim, funder_share: share });
      return {
        category: m.category,
        reason: m.reason,
        quote: m.quote,
        page: m.page,
        quote_verified: m.quote_verified,
        totals: alt ? Object.fromEntries(alt.scenarios.map((s) => [s.name, s.total_eur])) : null,
        note: alt ? null : "No opt-in data for this category in the table",
      };
    });
  (v as any).category_alternatives = alts.length ? field(alts, "computed", { note: "Other categories the decision supports, with the claim value each would give" }) : missing("No other category");
  v.opt_in_expected = r && r.expected_pct !== null ? field({ expected_pct: r.expected_pct, std_dev_pts: r.std_dev_pts }, "computed", { note: "Expected opt-in rate across past cases in this category (not a probability of success)" }) : missing("Cannot be computed");
}

export class EditRejected extends Error {}

// Apply association edits like { "association.name": "X", "value.funding_sought_eur": 2000000 }.
// Facts from the decision and computed figures are locked; everything else can be changed and is tagged "association".
export function applyEdits(brief: Brief, edits: Record<string, unknown>): Brief {
  for (const [p, value] of Object.entries(edits)) {
    if (p === "_edited_at") continue;
    const parts = p.split(".");
    if (parts[0] === "platform_assessment") throw new EditRejected(`${p} is the platform's independent assessment and cannot be edited`);
    let target: any = brief;
    for (const k of parts) target = target?.[k];
    if (!target || typeof target !== "object" || !("source" in target)) throw new EditRejected(`Unknown field: ${p}`);
    if (target.source === "decision" || target.source === "computed")
      throw new EditRejected(`${p} comes from the ${target.source === "decision" ? "CNIL decision" : "calculation"} and cannot be edited`);
    target.value = value;
    target.source = "association";
    target.quote = null;
    target.page = null;
    target.quote_verified = false;
    target.note = "Edited by the association";
  }
  brief.edited_at = typeof edits._edited_at === "string" ? edits._edited_at : brief.edited_at;
  return brief;
}

// The generated brief, with the Value section rebuilt from config + category.json and the association's edits
// (stored separately in brief-edits.json) applied on top; then the totals are computed.
export async function loadBrief(id: string): Promise<Brief | null> {
  const brief = await readJsonOr<Brief | null>(id, "brief.json", null);
  if (!brief) return null;
  const [cat, a, edits, revenue] = await Promise.all([
    readJsonOr<HarmCategory | null>(id, "category.json", null),
    loadAssumptions(),
    readJsonOr<Record<string, unknown>>(id, "brief-edits.json", {}),
    readJsonOr<Revenue | null>(id, "revenue.json", null),
  ]);
  (brief as any).value = valueSection(cat, a);
  (brief.defendant as any).current_revenue = revenueField(revenue);
  if (Object.keys(edits).length) applyEdits(brief, edits);
  computeValue(brief, a);
  computeSolvency(brief);
  return brief;
}
