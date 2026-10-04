import fs from "node:fs/promises";
import path from "node:path";
import { askJson } from "./mistral.ts";
import { addQuoteFlags } from "./quoteCheck.ts";
import { withPageMarkers } from "./decisionText.ts";
import { readJson, writeJson, type Page } from "./storage.ts";

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

export async function extractCase(id: string, pages: Page[]) {
  const [system, schema] = await Promise.all([prompt("extract.txt"), prompt("schema.json")]);
  const result = await askJson(`${system}\n${EXTRACT_FORMAT}\n\nSCHEMA:\n${schema}`, withPageMarkers(pages));
  const caseJson = { ...result, case_id: id };
  return addQuoteFlags(caseJson, pages);
}

export async function runExtract(id: string) {
  const pages = await readJson<Page[]>(id, "pages.json");
  const caseJson = await extractCase(id, pages);
  await writeJson(id, "case.json", caseJson);
  return caseJson;
}
