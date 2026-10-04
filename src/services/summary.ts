import fs from "node:fs/promises";
import path from "node:path";
import { askJson } from "./mistral.ts";
import { addQuoteFlags, requoteFailed } from "./quoteCheck.ts";
import { withPageMarkers } from "./decisionText.ts";
import { readJson, writeJson, type Page } from "./storage.ts";

export type SummarySentence = { text: string; quote: string | null; page: number | null; quote_verified: boolean };

export async function generateSummary(pages: Page[]): Promise<{ sentences: SummarySentence[] }> {
  const system = await fs.readFile(path.resolve("prompts/summary.txt"), "utf8");
  const result = await askJson<{ sentences: SummarySentence[] }>(system, withPageMarkers(pages));
  const sentences = (result.sentences ?? []).filter((s) => s?.text);
  return { sentences: await requoteFailed(addQuoteFlags(sentences, pages), pages) };
}

export async function runSummary(id: string) {
  const pages = await readJson<Page[]>(id, "pages.json");
  const summary = await generateSummary(pages);
  await writeJson(id, "summary.json", summary);
  return summary;
}
