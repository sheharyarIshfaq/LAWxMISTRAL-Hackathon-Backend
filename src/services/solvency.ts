import { askJson, mistral, CHAT_MODEL } from "./mistral.ts";
import { readJson, writeJson } from "./storage.ts";

// Legal team's rule: exposure (victims × € per victim × base opt-in rate) ÷ revenue.
export const SOLVENCY_RULE = "exposure ÷ revenue: strong < 10%, medium 10–50%, low > 50%";

export type Revenue = { amount_eur: number; year: number | null; entity: string; source: { url: string; title: string } | null; origin: "web" | "decision"; found_at: string };

export function rateSolvency(exposureEur: number, revenueEur: number) {
  const ratio = exposureEur / revenueEur;
  const rating = ratio < 0.1 ? "strong" : ratio <= 0.5 ? "medium" : "low";
  return { ratio, rating: rating as "strong" | "medium" | "low" };
}

const SEARCH = (name: string, group: string | null) =>
  `Find the most recent annual revenue (chiffre d'affaires) of the French company ${name}${group ? `. If ${name} does not publish its own revenue, give the revenue of its parent group ${group}` : ""}. Search the web. Give the amount in euros, the fiscal year, which entity it belongs to, and the source.`;

const STRUCTURE = `You extract one revenue figure from web search results. The text cites sources with markers like [S1].
Return only JSON: {"amount_eur": 0, "year": 0, "entity": "", "source": "S1"}
Rules: take the most recent full-year revenue stated in the text, in euros as an integer (convert "10,2 milliards" to 10200000000). "entity" is the company the figure belongs to. "source" is the marker that follows the figure in the text. If no figure with a source marker is stated, return {"amount_eur": null, "year": null, "entity": null, "source": null}. Never estimate.`;

// Web search (Mistral agent) for the defendant's latest revenue. Only a URL that the search really returned is kept.
export async function findRevenue(name: string, group: string | null): Promise<Revenue | null> {
  const res: any = await mistral().beta.conversations.start({ model: CHAT_MODEL, inputs: SEARCH(name, group), tools: [{ type: "web_search" }], store: false } as any);
  const sources = new Map<string, { url: string; title: string }>();
  const byUrl = new Map<string, string>();
  let text = "";
  for (const out of res.outputs ?? []) {
    if (out.type !== "message.output") continue;
    for (const c of Array.isArray(out.content) ? out.content : [{ type: "text", text: out.content }]) {
      if (c.type === "tool_reference" && c.url) {
        let key = byUrl.get(c.url);
        if (!key) {
          key = `S${sources.size + 1}`;
          sources.set(key, { url: c.url, title: c.title ?? c.url });
          byUrl.set(c.url, key);
        }
        text += ` [${key}]`;
      } else if (typeof c.text === "string") text += c.text;
    }
  }
  if (!sources.size) return null;
  const r = await askJson<any>(STRUCTURE, text);
  const source = typeof r.source === "string" ? sources.get(r.source.replace(/[\[\]]/g, "")) : undefined;
  if (typeof r.amount_eur !== "number" || r.amount_eur <= 0 || !source) return null;
  return { amount_eur: Math.round(r.amount_eur), year: typeof r.year === "number" ? r.year : null, entity: String(r.entity ?? name), source, origin: "web", found_at: new Date().toISOString() };
}

// Saves data/<id>/revenue.json: the web figure if one with a real source is found, else the figure stated in the decision.
export async function runRevenue(id: string): Promise<Revenue | null> {
  const brief = await readJson(id, "brief.json");
  const name = brief.defendant?.name?.value ?? brief.header?.defendant?.value;
  const group = brief.defendant?.group?.value ?? null;
  let revenue: Revenue | null = null;
  try {
    revenue = await findRevenue(name, group);
  } catch (err: any) {
    console.warn(`  web search failed: ${err.message}`);
  }
  if (!revenue) {
    const d = brief.defendant?.revenue?.value;
    if (d?.amount_eur) revenue = { amount_eur: d.amount_eur, year: d.year ?? null, entity: d.entity ?? name, source: null, origin: "decision", found_at: new Date().toISOString() };
  }
  if (revenue) await writeJson(id, "revenue.json", revenue);
  return revenue;
}
