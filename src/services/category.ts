import fs from "node:fs/promises";
import path from "node:path";
import { askJson } from "./mistral.ts";
import { addQuoteFlags, requoteFailed } from "./quoteCheck.ts";
import { withPageMarkers } from "./decisionText.ts";
import { findRow, loadAssumptions, type Assumptions } from "./recovery.ts";
import { readJson, writeJson, type Page } from "./storage.ts";

export type CategoryMatch = {
  category: string; // exactly one row of the opt-in table
  reason: string;
  quote: string | null;
  page: number | null;
  quote_verified: boolean;
  quote_fixed?: string;
};

export type HarmCategory = {
  category: string | null; // the row used for the scenarios, chosen by the rule below (not by the model)
  rule: string;
  matches: CategoryMatch[]; // every row the decision supports, each with its own reason and quote
  // Of the chosen row (kept flat for the brief):
  reason: string;
  quote: string | null;
  page: number | null;
  quote_verified: boolean;
  quote_fixed?: string;
  other_categories: string[];
};

export const RULES: Record<string, string> = {
  most_conservative:
    "If the decision supports a data-breach row (\"Violation de données…\"), choose among those only; then the most conservative one (lowest base opt-in rate) whose quote is verified",
};

const BREACH_ROW = /^violation de données/i;

// The rule picks the row, not the model. Rows describe different harms, so a data-breach case is compared only with
// data-breach rows; among them, the lowest base opt-in rate wins. Rows without opt-in data are never chosen.
export function chooseCategory(matches: CategoryMatch[], a: Assumptions, _rule = "most_conservative"): CategoryMatch | null {
  const withData = matches.filter((m) => findRow(a, m.category)?.base_pct != null);
  const breach = withData.filter((m) => BREACH_ROW.test(m.category));
  const scope = breach.length ? breach : withData;
  const verified = scope.filter((m) => m.quote_verified);
  const pool = verified.length ? verified : scope;
  return pool.sort((x, y) => findRow(a, x.category)!.base_pct! - findRow(a, y.category)!.base_pct!)[0] ?? null;
}

export async function classifyCategory(pages: Page[]): Promise<HarmCategory> {
  const a = await loadAssumptions();
  const list = a.opt_in_table.map((r) => `- ${r.category}`).join("\n");
  const system = await fs.readFile(path.resolve("prompts/category.txt"), "utf8");
  const raw = await askJson<any>(system, `CATEGORIES:\n${list}\n\nDECISION:\n${withPageMarkers(pages)}`);
  const seen = new Set<string>();
  const matches: CategoryMatch[] = [];
  for (const m of raw.matches ?? []) {
    const row = findRow(a, m?.category);
    if (!row) {
      console.warn(`  ignored a category not in the table: "${m?.category}"`);
      continue;
    }
    if (seen.has(row.category)) continue;
    seen.add(row.category);
    matches.push({ category: row.category, reason: String(m.reason ?? ""), quote: m.quote || null, page: m.quote ? m.page ?? null : null, quote_verified: false });
  }
  await requoteFailed(addQuoteFlags(matches, pages), pages);
  const rule = (a as any).category_rule ?? "most_conservative";
  const chosen = chooseCategory(matches, a, rule);
  return {
    category: chosen?.category ?? null,
    rule: RULES[rule] ?? rule,
    matches,
    reason: chosen?.reason ?? "",
    quote: chosen?.quote ?? null,
    page: chosen?.page ?? null,
    quote_verified: chosen?.quote_verified ?? false,
    ...(chosen?.quote_fixed ? { quote_fixed: chosen.quote_fixed } : {}),
    other_categories: matches.filter((m) => m !== chosen).map((m) => m.category),
  };
}

export async function runCategory(id: string) {
  const pages = await readJson<Page[]>(id, "pages.json");
  const category = await classifyCategory(pages);
  await writeJson(id, "category.json", category);
  return category;
}
