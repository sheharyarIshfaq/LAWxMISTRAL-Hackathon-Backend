import fs from "node:fs/promises";
import path from "node:path";
import { askJson } from "./mistral.ts";
import { addQuoteFlags, requoteFailed } from "./quoteCheck.ts";
import { withPageMarkers } from "./decisionText.ts";
import { loadBrief, type Brief, type Field } from "./brief.ts";
import { renderCitations, type Summary } from "./summary.ts";
import { NotFound, readJson, readJsonOr, writeJson, type Page } from "./storage.ts";

export const CRITERIA = [
  "fault_established",
  "data_sensitivity",
  "group_size",
  "harm_evidence",
  "victim_notification_failure",
  "defendant",
  "recoverability",
] as const;

// Formatting and JSON-reliability instructions only; the scoring rules stay in prompts/verify.txt.
const VERIFY_FORMAT = `
Output format:
- The pitch is given as one claim per line. Lines ending in "(assumption)" are assumptions: list them with status "assumption" and do not verify them. Lines ending in "(entered by the association)" were written by the association: verify them like any other claim.
- "claims": one item per factual claim, "claim" in English. "status" is exactly one of "supported", "overstated", "unsupported", "assumption". For "unsupported" and "assumption", use "" for quote and null for page.
- "scores": exactly 7 items, one per criterion, with "criterion" exactly one of: ${CRITERIA.join(", ")}. "rating" is exactly "strong", "medium" or "weak". "reason" is one sentence in English.
- Each quote is one continuous passage copied character for character from the decision, in French, max 40 words. Keep pronouns as written, do not skip text in brackets, do not use "...". "page" is the number of the nearest [PAGE n] marker before the quoted text.
- "red_flags": short sentences in English.
- Never write a percentage, probability, likelihood or chance of success anywhere, including in "summary".`;

const label = (f: Field) => (f.source === "assumption" || f.source === "computed" ? " (assumption)" : f.source === "association" ? " (entered by the association)" : "");
const show = (v: unknown): string =>
  Array.isArray(v) ? v.map(show).join(", ") : v && typeof v === "object" ? Object.values(v).filter((x) => x != null).map(show).join(" · ") : String(v);

// The pitch the investor receives, one claim per line: the brief's filled-in fields plus the summary sentences.
export function briefToClaims(brief: Brief, summary: Summary | null): string {
  const b = brief;
  const lines: string[] = [];
  const add = (text: string, f: Field) => {
    if (f.value === null || f.value === undefined || f.source === "missing") return;
    lines.push(`- ${text}: ${show(f.value)}${label(f)}`);
  };
  add("Defendant", b.header.defendant);
  add("Source decision", b.header.source_decision);
  for (const l of (b.header.legal_basis.value as any[] | null) ?? []) lines.push(`- The CNIL found a breach of ${l.article} (${l.label})`);
  add("Appeal status", b.header.status);
  add("Is the harm quantified", b.harm.quantified);
  add("Nature of the harm", b.harm.nature);
  add("Harm", b.harm.description);
  add(`Number of victims (${b.victims.number.note})`, b.victims.number);
  add("Victims are identifiable", b.victims.identifiable);
  add("Victim category", b.victims.categories);
  add("Proof of class membership", b.victims.proof_of_membership);
  add("Victim subgroups", b.victims.subgroups);
  add("Defendant nature", b.defendant.nature);
  add("Defendant solvency", b.defendant.solvency);
  add("Defendant revenue", b.defendant.revenue);
  add("Defendant group", b.defendant.group);
  add("Defendant insurance", b.defendant.insurance);
  add("Competent court", b.defendant.competent_court);
  // The category is a row of the legal team's opt-in table, chosen from the decision: a methodology choice, not a fact.
  if (b.value.harm_category.value) lines.push(`- Opt-in rates taken from the legal team's table row "${b.value.harm_category.value}" (assumption)`);
  for (const s of (b.value.scenarios.value as any[] | null) ?? [])
    lines.push(`- Recovery scenario ${s.name}: ${s.opt_ins} opt-ins (${s.opt_in_rate * 100}%) x €${s.compensation_per_victim_eur} = €${s.total_eur} (assumption)`);
  add("Funding sought (EUR)", b.value.funding_sought_eur);
  add("Funder share", b.value.funder_share);
  add("Breach period", b.timeline.facts);
  for (const [k, f] of Object.entries(b.timeline)) if (!["facts", "source_decision"].includes(k)) add(`Timeline ${k}`, f as Field);
  // Summary paragraphs (citations as plain "(§ N)", bold removed), one claim line each.
  if (summary)
    for (const para of renderCitations(summary, { url: null, plain: true }).split(/\n\s*\n/)) {
      const text = para.replace(/^#+\s.*$/gm, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
      if (text.length > 40) lines.push(`- ${text}`);
    }
  return lines.join("\n");
}

// Belt and braces: drop any sentence that states a probability or chance of success.
const PROBABILITY = /(\d+\s?%[^.]*\b(chance|probabilit|likel|succe|win))|\b(probabilit(y|é)|chance[s]? (of|de) (success|winning|succès|gagner)|likelihood of (success|winning)|likely to (win|succeed))/i;
function stripProbability(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => {
      if (!PROBABILITY.test(s)) return true;
      console.warn(`  removed probability statement: "${s}"`);
      return false;
    })
    .join(" ");
}

export type Scorecard = {
  claims: { claim: string; status: string; quote: string | null; page: number | null; note: string; quote_verified: boolean }[];
  scores: { criterion: string; rating: string | null; reason: string; quote: string | null; page: number | null; quote_verified: boolean }[];
  red_flags: string[];
  summary: string;
  counts: Record<"supported" | "to_check" | "overstated" | "unsupported" | "assumption", number>;
  ratings: Record<"strong" | "medium" | "weak", number>;
  checked_at: string;
  brief_edited_at: string | null;
};

export async function generateScorecard(brief: Brief, summary: Summary | null, pages: Page[]): Promise<Scorecard> {
  const system = `${await fs.readFile(path.resolve("prompts/verify.txt"), "utf8")}\n${VERIFY_FORMAT}`;
  const user = `PITCH:\n${briefToClaims(brief, summary)}\n\nDECISION:\n${withPageMarkers(pages)}`;
  // The model sometimes returns scores as an object keyed by criterion, or skips some: normalise, retry once if incomplete.
  const scoresOf = (r: any): Map<string, any> => {
    const list = Array.isArray(r?.scores) ? r.scores : r?.scores && typeof r.scores === "object" ? Object.entries(r.scores).map(([criterion, v]: any) => ({ criterion, ...v })) : [];
    return new Map(list.filter((x: any) => x?.criterion).map((x: any) => [String(x.criterion).trim().toLowerCase(), x]));
  };
  let raw = await askJson<any>(system, user);
  if (CRITERIA.some((c) => !scoresOf(raw).has(c))) {
    console.warn("  scores incomplete, asking again");
    raw = await askJson<any>(system, user);
  }

  const claims = (raw.claims ?? []).filter((c: any) => c?.claim).map((c: any) => ({
    claim: String(c.claim),
    status: ["supported", "overstated", "unsupported", "assumption"].includes(c.status) ? c.status : "unsupported",
    quote: c.quote || null,
    page: c.quote ? c.page ?? null : null,
    note: stripProbability(String(c.note ?? "")),
  }));
  const byCriterion = scoresOf(raw);
  // Never invent a rating: a criterion the model did not assess gets rating null.
  const scores = CRITERIA.map((criterion) => {
    const s: any = byCriterion.get(criterion) ?? {};
    return {
      criterion,
      rating: ["strong", "medium", "weak"].includes(s.rating) ? s.rating : null,
      reason: stripProbability(String(s.reason ?? "Not assessed.")),
      quote: s.quote || null,
      page: s.quote ? s.page ?? null : null,
    };
  });
  const checked = await requoteFailed(addQuoteFlags({ claims, scores }, pages), pages);
  // A "supported" claim whose quote cannot be found word for word is not proven either way: flag it for a human.
  for (const c of checked.claims as any[]) {
    if (!c.quote) c.quote_verified = false;
    if (c.status === "supported" && !c.quote_verified)
      c.note = `${c.note ? c.note + " " : ""}Quote not found word for word in the decision: check manually.`.trim();
  }

  const count = <K extends string>(items: any[], key: string, keys: readonly K[]) =>
    Object.fromEntries(keys.map((k) => [k, items.filter((i) => i[key] === k).length])) as Record<K, number>;

  return {
    claims: checked.claims as Scorecard["claims"],
    scores: checked.scores as Scorecard["scores"],
    red_flags: (raw.red_flags ?? []).map((f: unknown) => stripProbability(String(f))).filter(Boolean),
    summary: stripProbability(String(raw.summary ?? "")),
    counts: {
      ...count(checked.claims, "status", ["supported", "overstated", "unsupported", "assumption"] as const),
      // "supported" counts only claims whose quote was verified; the rest are "to_check".
      supported: (checked.claims as any[]).filter((c) => c.status === "supported" && c.quote_verified).length,
      to_check: (checked.claims as any[]).filter((c) => c.status === "supported" && !c.quote_verified).length,
    },
    ratings: count(checked.scores, "rating", ["strong", "medium", "weak"] as const),
    checked_at: new Date().toISOString(),
    brief_edited_at: brief.edited_at,
  };
}

// What the brief shows: locked, written by the platform, never by the association.
export function platformAssessment(sc: Scorecard | null, brief: Brief) {
  if (!sc) return null;
  return {
    source: "platform" as const,
    note: "Independent check by the platform against the CNIL decision. Cannot be edited by the association. No probability of success is given.",
    stale: (sc.brief_edited_at ?? null) !== (brief.edited_at ?? null),
    checked_at: sc.checked_at,
    counts: sc.counts,
    ratings: sc.ratings,
    scores: sc.scores,
    red_flags: sc.red_flags,
    summary: sc.summary,
  };
}

// Runs the funder check on the brief as the investor would receive it (association edits included).
export async function runCheck(id: string): Promise<Scorecard> {
  const brief = await loadBrief(id);
  if (!brief) throw new NotFound(`${id} has no brief yet`);
  const [summary, pages] = await Promise.all([readJsonOr(id, "summary.json", null), readJson<Page[]>(id, "pages.json")]);
  const scorecard = await generateScorecard(brief, summary, pages);
  await writeJson(id, "scorecard.json", scorecard);
  return scorecard;
}
