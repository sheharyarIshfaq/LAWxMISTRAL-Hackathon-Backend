import fs from "node:fs/promises";
import path from "node:path";
import { askJson } from "./mistral.ts";
import { addQuoteFlags, requoteFailed } from "./quoteCheck.ts";
import { withPageMarkers } from "./decisionText.ts";
import { findRow, loadAssumptions } from "./recovery.ts";
import { readJson, writeJson, type Page } from "./storage.ts";

export type HarmCategory = {
  category: string | null; // exactly one row of the opt-in table, or null if the model's answer was not in the list
  other_categories: string[];
  reason: string;
  quote: string | null;
  page: number | null;
  quote_verified: boolean;
  quote_fixed?: string;
};

// The model only chooses the row (closed list) and quotes why; the code checks both. No numbers involved.
export async function classifyCategory(pages: Page[]): Promise<HarmCategory> {
  const a = await loadAssumptions();
  const list = a.opt_in_table.map((r) => `- ${r.category}`).join("\n");
  const system = await fs.readFile(path.resolve("prompts/category.txt"), "utf8");
  const raw = await askJson<any>(system, `CATEGORIES:\n${list}\n\nDECISION:\n${withPageMarkers(pages)}`);
  const pick = findRow(a, raw.category);
  if (!pick) console.warn(`  model answered a category not in the table: "${raw.category}"`);
  const result: HarmCategory = {
    category: pick?.category ?? null,
    other_categories: (raw.other_categories ?? []).map((c: string) => findRow(a, c)?.category).filter((c: string | undefined): c is string => !!c && c !== pick?.category),
    reason: String(raw.reason ?? ""),
    quote: raw.quote || null,
    page: raw.quote ? raw.page ?? null : null,
    quote_verified: false,
  };
  return requoteFailed(addQuoteFlags(result, pages), pages);
}

export async function runCategory(id: string) {
  const pages = await readJson<Page[]>(id, "pages.json");
  const category = await classifyCategory(pages);
  await writeJson(id, "category.json", category);
  return category;
}
