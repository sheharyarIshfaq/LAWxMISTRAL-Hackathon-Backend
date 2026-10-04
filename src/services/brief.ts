import fs from "node:fs/promises";
import path from "node:path";
import { askJson } from "./mistral.ts";
import { addQuoteFlags, requoteFailed } from "./quoteCheck.ts";
import { withPageMarkers } from "./decisionText.ts";
import { computeRecovery, loadAssumptions } from "./recovery.ts";
import type { Page } from "./storage.ts";

// Where each value in the brief comes from. The frontend styles fields by source.
export type Source = "decision" | "assessment" | "computed" | "assumption" | "association" | "missing";

export type Field<T = unknown> = {
  value: T | null;
  source: Source;
  quote?: string | null;
  page?: number | null;
  quote_verified?: boolean;
  quote_fixed?: "page_corrected" | "repaired" | "trimmed";
  note?: string;
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
  const recovery = computeRecovery(c, a);
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
      insurance: missing("Not stated in the decision"),
      competent_court: field((a as any).competent_court_by_legal_form?.[c.defendant?.legal_form], "assumption"),
    },
    value: {
      formula: "Total = victims who opt in × compensation per victim",
      scenarios: field(
        recovery?.scenarios.map((s) => ({
          name: s.name,
          opt_in_rate: s.opt_in_rate,
          opt_ins: Math.round(recovery.people_affected * s.opt_in_rate),
          compensation_per_victim_eur: recovery.compensation_per_person_eur,
          total_eur: s.gross_eur,
        })),
        "computed",
        { note: recovery ? `Opt-in rates and € per victim are assumptions (rate based on: ${recovery.compensation_basis.join(", ")})` : "Cannot be computed from the decision" }
      ),
      funding_sought_eur: missing("To be set by the association"),
      funder_share: field(a.funder_share, "assumption"),
      benchmarks_note: field((a as any).benchmarks_note, "assumption"),
    },
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
      no_funder_influence: field(false, "association", { note: "Confirmed by the association" }),
      funding_publicly_disclosed: field(false, "association", { note: "Confirmed by the association" }),
      conflict_of_interest_policy: field(false, "association", { note: "Confirmed by the association" }),
      funder_has_no_ties_to_defendant: field(false, "association", { note: "Confirmed by the association" }),
    },
  };
}

export type Brief = Awaited<ReturnType<typeof generateBrief>>;

export class EditRejected extends Error {}

// Apply association edits like { "association.name": "X", "value.funding_sought_eur": 2000000 }.
// Facts from the decision and computed figures are locked; everything else can be changed and is tagged "association".
export function applyEdits(brief: Brief, edits: Record<string, unknown>): Brief {
  for (const [p, value] of Object.entries(edits)) {
    if (p === "_edited_at") continue;
    const parts = p.split(".");
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
