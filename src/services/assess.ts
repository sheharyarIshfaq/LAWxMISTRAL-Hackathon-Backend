import fs from "node:fs/promises";
import path from "node:path";
import { askJson } from "./mistral.ts";
import { addQuoteFlags, requoteFailed } from "./quoteCheck.ts";
import { withPageMarkers } from "./decisionText.ts";
import { buildParagraphs, locate, type Paragraph } from "./paragraphs.ts";
import { legifranceLink } from "./legifrance.ts";
import { decisionUrl } from "./summary.ts";
import { readJson, writeJson, type Page } from "./storage.ts";

// Formatting notes only; the legal rules are the legal team's text in prompts/identifiability.txt and harm-quantified.txt.
const QUOTE_RULES = `- Every "quote" is copied verbatim from the decision, in French, max 40 words: one continuous passage, character for character, keeping pronouns as written, no "...". "page" is the number of the nearest [PAGE n] marker before it. The tool finds the paragraph (§) number itself: do not write § numbers in any text field.
- Write every text field ("statement", "evidence", "explanation", "group", "justification") in English, even though the decision is in French. Return only JSON.`;

const IDENTIFIABILITY_FORMAT = `
Output format (JSON):
{"level": "yes | partly | no",
 "statement": "the answer in one sentence naming the evidence, e.g. Subscribers notified by email between 24 and 29 October 2024",
 "list_holder": {"answer": "yes | partly | no", "evidence": "", "quote": "", "page": 0},
 "proof": {"answer": "yes | partly | no", "evidence": "", "quote": "", "page": 0},
 "subgroups": [{"group": "", "level": "yes | partly | no", "evidence": "", "quote": "", "page": 0}],
 "weakening": [{"wording": "", "explanation": "", "quote": "", "page": 0}]}
- "subgroups" only if parts of the group differ (rule 3); otherwise [].
- "weakening" (rule 4): go through the whole decision and list EVERY instance of: third parties; former customers or subscribers ("anciens abonnés", "anciens clients"); terminated contracts; a communication to the people concerned that the authority found insufficient (e.g. a breach of article 34). One item per instance, with its quote. Empty only if none appears.
${QUOTE_RULES}`;

const HARM_FORMAT = `
Output format (JSON):
{"level": "quantified | quantifiable | to_be_proven",
 "justification": "one or two sentences",
 "quotes": [{"quote": "", "page": 0}],
 "subgroups": [{"group": "", "level": "quantified | quantifiable | to_be_proven", "justification": "", "quote": "", "page": 0}]}
- "quotes": the passages that justify the level (rules 1, 2 and 5). "subgroups" only if sub-groups differ (rule 4), otherwise [].
${QUOTE_RULES}`;

const prompt = (f: string) => fs.readFile(path.resolve("prompts", f), "utf8");

// For every object with a verified quote: the § it is in and a Légifrance link that highlights it.
function cite(value: any, paragraphs: Paragraph[], url: string | null) {
  if (Array.isArray(value)) return value.forEach((v) => cite(v, paragraphs, url));
  if (!value || typeof value !== "object") return;
  if ("quote" in value) {
    const para = value.quote ? locate(value.quote, paragraphs) : null;
    value.paragraph = value.quote_verified && para ? para.label : null;
    value.url = value.paragraph && url ? legifranceLink(url, { label: value.paragraph, fragment: value.quote, quote: null }, paragraphs) : null;
  }
  for (const v of Object.values(value)) if (v && typeof v === "object") cite(v, paragraphs, url);
}

const LEVELS = { identifiability: ["yes", "partly", "no"], harm: ["quantified", "quantifiable", "to_be_proven"] };

export async function runAssessments(id: string) {
  const pages = await readJson<Page[]>(id, "pages.json");
  const decision = withPageMarkers(pages);
  const [idRules, harmRules] = await Promise.all([prompt("identifiability.txt"), prompt("harm-quantified.txt")]);
  const [identifiability, harm] = await Promise.all([
    askJson<any>(`${idRules}\n${IDENTIFIABILITY_FORMAT}`, decision),
    askJson<any>(`${harmRules}\n${HARM_FORMAT}`, decision),
  ]);
  if (!LEVELS.identifiability.includes(identifiability.level)) identifiability.level = null;
  if (!LEVELS.harm.includes(harm.level)) harm.level = null;
  for (const x of [identifiability, harm]) await requoteFailed(addQuoteFlags(x, pages), pages);
  const paragraphs = buildParagraphs(pages);
  const url = await decisionUrl(id);
  cite(identifiability, paragraphs, url);
  cite(harm, paragraphs, url);
  // One weakening flag per kind of wording; several quotes/§ for the same wording are merged.
  const byKind = new Map<string, any>();
  for (const w of identifiability.weakening ?? []) {
    const key = String(w.wording ?? "").toLowerCase().trim();
    const prev = byKind.get(key);
    if (prev) prev.sources.push({ quote: w.quote, page: w.page, quote_verified: w.quote_verified, paragraph: w.paragraph, url: w.url });
    else byKind.set(key, { wording: w.wording, explanation: w.explanation, sources: [{ quote: w.quote, page: w.page, quote_verified: w.quote_verified, paragraph: w.paragraph, url: w.url }] });
  }
  identifiability.weakening = [...byKind.values()];
  const result = { identifiability, harm, assessed_at: new Date().toISOString() };
  await writeJson(id, "assessments.json", result);
  return result;
}

// "Yes: subscribers notified by email … (§ 3)" — § numbers come from the verified quotes, never from the model.
export const refs = (...objs: any[]) => {
  const labels = [...new Set(objs.flat().filter((o) => o?.paragraph).map((o) => o.paragraph))];
  return labels.length ? ` (${labels.join(", ")})` : "";
};
