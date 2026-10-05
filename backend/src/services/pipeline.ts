import fs from "node:fs/promises";
import path from "node:path";
import { askJson, askText } from "./mistral.ts";
import { addQuoteFlags, quoteOk, requoteFailed } from "./quoteCheck.ts";
import { withPageMarkers } from "./decisionText.ts";
import { readJson, readJsonOr, writeJson, writeText, type Page } from "./storage.ts";
import type { HarmCategory } from "./category.ts";
import { computeRecovery, loadAssumptions, recoveryTable } from "./recovery.ts";
import { generateBrief } from "./brief.ts";
import { decisionInfo, promptFor } from "./decisionKind.ts";

const prompt = (name: string) => fs.readFile(path.resolve("prompts", name), "utf8");

// Formatting and JSON-reliability instructions only; the legal rules stay in prompts/extract.txt.
const EXTRACT_FORMAT = `
Output format:
- Return one JSON object with exactly the keys of the schema below. Do not add, rename or remove keys.
- The schema shows placeholder values. Where it shows options separated by "|" (e.g. "private | public"), output exactly one of them.
- "data_types" must contain only the types that apply, chosen from: identity, contact, iban, health, password, other.
- "page" is the number of the nearest [PAGE n] marker before the quoted text.
- Each quote must be one continuous passage copied character for character from the decision, including accents and apostrophes. Do not add, drop, reorder or replace words: if the passage says "elle" or "la société", keep exactly that, never substitute a name. Do not use "..." and do not join text from different places. Do not skip text in brackets or parentheses inside the passage; choose a shorter passage instead. Do not include the [PAGE n] marker in a quote.
- "victim_notification" is about informing the affected people (data subjects), not notifying the CNIL. Its quote must be about the communication to the people concerned.
- "people_affected_unit" must be exactly "persons", "contracts" or "accounts" (in English).
- "missing_information" is a list of field paths, e.g. "decision.under_appeal".
- Write "summary", "attack_vector", "sector", "label" and "finding" in English.`;

// Same notes for European Commission DMA decisions (English quotes, DMA fields).
const EXTRACT_FORMAT_EU = `
Output format:
- Return one JSON object with exactly the keys of the schema below. Do not add, rename or remove keys.
- The schema shows placeholder values. Where it shows options separated by "|", output exactly one of them.
- "page" is the number of the nearest [PAGE n] marker before the quoted text.
- Each quote must be one continuous passage copied character for character from the decision. Do not add, drop, reorder or replace words. Do not use "..." and do not join text from different places. Do not skip text in brackets or parentheses inside the passage; choose a shorter passage instead. Do not include the [PAGE n] marker or a recital number like "(613)" in a quote.
- "missing_information" is a list of field paths, e.g. "decision.under_appeal".
- Write every text field in English.`;

export async function extractCase(id: string, pages: Page[]) {
  const info = await decisionInfo(id);
  const [system, schema] = await Promise.all([promptFor(id, "extract.txt"), promptFor(id, "schema.json")]);
  const format = info.kind === "cnil" ? EXTRACT_FORMAT : EXTRACT_FORMAT_EU;
  const result = await askJson(`${system}\n${format}\n\nSCHEMA:\n${schema}`, withPageMarkers(pages));
  const caseJson = { ...result, case_id: id };
  // The case number we registered (e.g. "DMA.100193") leads the reference, before the document number the model found.
  if (info.kind !== "cnil" && info.reference && caseJson.decision && !String(caseJson.decision.reference ?? "").includes(info.reference))
    caseJson.decision.reference = [info.reference, caseJson.decision.reference].filter(Boolean).join(" · ");
  return requoteFailed(addQuoteFlags(caseJson, pages), pages);
}

export async function runExtract(id: string) {
  const pages = await readJson<Page[]>(id, "pages.json");
  const caseJson = await extractCase(id, pages);
  await writeJson(id, "case.json", caseJson);
  return caseJson;
}

const TABLE_MARKER = "{{RECOVERY_TABLE}}";

// Formatting instructions only; the legal rules stay in prompts/pitch.txt.
const PITCH_FORMAT = `
Output format:
- Markdown. Use each of the 7 section titles as a "## " heading, numbered as in the structure above.
- Quote only from the "quote" fields of the case JSON, copied exactly, in French, formatted as: "quote" (p. N). Do not translate, shorten or invent quotes.
- Do not calculate anything. Every number you write must appear in the input. Under heading 5, write one sentence stating the formula, then put the line ${TABLE_MARKER} on its own line: the recovery table and its assumption labels are inserted there by code. Do not write any recovery figures yourself.
- Refer to missing information in plain words (e.g. "appeal status is not stated in the decision"), never by field names like "decision.under_appeal".
- If "recovery" in the input is null, write under heading 5 that recovery cannot be estimated from the decision and why, and do not output ${TABLE_MARKER}.`;

// Quotes that failed the check are removed before the pitch, so it can never cite them.
function withoutUnverifiedQuotes(value: any): any {
  if (Array.isArray(value)) return value.map(withoutUnverifiedQuotes);
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = withoutUnverifiedQuotes(v);
    if ("quote_verified" in out && !out.quote_verified) {
      out.quote = null;
      out.page = null;
    }
    delete out.quote_verified;
    return out;
  }
  return value;
}

export async function generatePitch(caseJson: any, pages: Page[], category: HarmCategory | null) {
  const assumptions = await loadAssumptions();
  const recovery = computeRecovery(caseJson.breach?.people_affected, caseJson.breach?.people_affected_unit, category?.category, assumptions);
  const assumptionValues = { harm_category: recovery?.category ?? null, compensation_per_victim_eur: assumptions.compensation_per_victim_eur, funder_share: assumptions.funder_share };
  const input = { case: withoutUnverifiedQuotes(caseJson), assumptions: assumptionValues, recovery };

  const system = `${await prompt("pitch.txt")}\n${PITCH_FORMAT}`;
  let markdown = (await askText(system, JSON.stringify(input, null, 2))).trim();
  markdown = markdown.replace(/^```(?:markdown)?\n?|\n?```$/g, "").trim();

  if (recovery) {
    const table = recoveryTable(recovery, assumptions);
    if (markdown.includes(TABLE_MARKER)) markdown = markdown.replace(TABLE_MARKER, `\n\n${table}\n\n`).replace(/\n{3,}/g, "\n\n");
    else {
      // Model forgot the marker: put the table at the end of section 5.
      const next = markdown.search(/\n## 6\b/);
      markdown = next >= 0 ? `${markdown.slice(0, next)}\n\n${table}\n${markdown.slice(next)}` : `${markdown}\n\n${table}`;
    }
  }
  markdown = markdown.replaceAll(TABLE_MARKER, "");

  return { markdown, recovery, checks: checkPitch(markdown, input, pages) };
}

// Report quotes in the pitch that are not in the decision, and numbers that are not in the input.
function checkPitch(markdown: string, input: unknown, pages: Page[]) {
  const quotes = [...markdown.matchAll(/["“«]\s*([^"”»]{10,}?)\s*["”»]\s*\(p\.\s*(\d+)\)/g)].map((m) => ({ quote: m[1], page: Number(m[2]), ok: quoteOk(m[1], Number(m[2]), pages) }));
  // French quotes write "202 246"; collect numbers both with and without their thousands separators.
  const json = JSON.stringify(input);
  const known = new Set([...(json.match(/\d+(?:\.\d+)?/g) ?? []), ...(json.match(/\d[\d \u00a0\u202f]*\d/g) ?? []).map((n) => n.replace(/\D/g, ""))].map(Number));
  const prose = markdown.replace(/^\|.*\|$/gm, "");
  const unknownNumbers = [...prose.matchAll(/\d[\d,.   ]*\d|\d/g)]
    .map((m) => m[0].replace(/[,   ]/g, ""))
    .filter((n) => {
      const v = Number(n);
      return !known.has(v) && !(v >= 1 && v <= 7) && !/^(19|20)\d\d$/.test(n) && !known.has(v * 1_000_000) && !known.has(v / 100);
    });
  return { quotes, unknown_numbers: [...new Set(unknownNumbers)] };
}

export async function runPitch(id: string) {
  const [caseJson, pages, category] = await Promise.all([readJson(id, "case.json"), readJson<Page[]>(id, "pages.json"), readJsonOr<HarmCategory | null>(id, "category.json", null)]);
  // The Markdown pitch prompt (prompts/pitch.txt) is written for CNIL data-breach cases; other decisions get the structured brief only.
  if ((await decisionInfo(id)).kind !== "cnil") {
    const brief = await generateBrief(caseJson, pages);
    await writeJson(id, "brief.json", brief);
    await writeText(id, "pitch.md", "");
    return { markdown: "", recovery: null, checks: { quotes: [], unknown_numbers: [] }, brief };
  }
  const [result, brief] = await Promise.all([generatePitch(caseJson, pages, category), generateBrief(caseJson, pages)]);
  await writeText(id, "pitch.md", result.markdown + "\n");
  await writeJson(id, "brief.json", brief);
  if (result.recovery) await writeJson(id, "recovery.json", result.recovery);
  return { ...result, brief };
}
