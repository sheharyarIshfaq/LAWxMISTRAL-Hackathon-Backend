import { randomUUID } from "node:crypto";
import { askJson, mistral, CHAT_MODEL } from "./mistral.ts";
import { CASE_TYPES, rebuildFunders, type Funder } from "./funders.ts";
import { writeJson, writeText } from "./storage.ts";

const SEARCH_PROMPT = `Find litigation funders (third-party funders) that fund, or say they fund, collective actions or group claims in France, especially consumer or data protection claims. Search the web.
For each funder give: name, website, the countries they fund cases in, whether they fund collective actions, which case types, the minimum claim size and the maximum investment per case if stated, and whether they fund claims against public bodies if stated.
Only report what the sources say. Up to 8 funders.`;

const STRUCTURE_PROMPT = `You turn web search results about litigation funders into JSON. The text cites its sources with markers like [S1], [S2].

Return only JSON: {"funders": [{"name": "", "website": null, "description": null, "jurisdictions": null, "funds_collective_actions": null, "case_types": null, "min_claim_eur": null, "max_investment_eur": null, "accepts_public_defendants": null, "sources": ["S1"]}]}

Rules:
- Use only facts stated in the text about that funder. If a fact is not stated, set the field to null. Never infer.
- "sources": the markers ([S1], [S2]...) that appear in the text about that funder. A funder with no marker must not be listed.
- "jurisdictions": ISO country codes (e.g. "FR"). "case_types": from ${CASE_TYPES.join(", ")}. Amounts in euros as integers.
- "description": one sentence in English.
- Never invent a funder, a fact or a source marker.`;

// Step 1: Mistral agent with web search. The text is rebuilt with [S#] markers where the search references appear,
// so only URLs that really came back from the search can be cited.
async function search(): Promise<{ text: string; sources: Map<string, { url: string; title: string }> }> {
  const res: any = await mistral().beta.conversations.start({
    model: CHAT_MODEL,
    inputs: SEARCH_PROMPT,
    tools: [{ type: "web_search" }],
    store: false,
  } as any);
  const sources = new Map<string, { url: string; title: string }>();
  const byUrl = new Map<string, string>();
  let text = "";
  for (const out of res.outputs ?? []) {
    if (out.type !== "message.output") continue;
    const chunks = Array.isArray(out.content) ? out.content : [{ type: "text", text: out.content }];
    for (const c of chunks) {
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
  return { text, sources };
}

// Step 2: structure into profiles. Code drops every fact whose source marker is not a real search reference.
export async function discoverFunders(): Promise<Funder[]> {
  const { text, sources } = await search();
  if (!sources.size) throw new Error("Web search returned no sources");
  // Keep the raw search answer and its sources for audit.
  await writeText("funders", "last-search.md", `${text}\n\n## Sources\n${[...sources].map(([k, v]) => `- [${k}] ${v.title} — ${v.url}`).join("\n")}\n`);
  const { funders = [] } = await askJson<{ funders: any[] }>(STRUCTURE_PROMPT, text);
  const now = new Date().toISOString();
  const fields = ["website", "description", "jurisdictions", "funds_collective_actions", "case_types", "min_claim_eur", "max_investment_eur", "accepts_public_defendants"] as const;

  return funders
    .filter((f) => typeof f?.name === "string" && f.name.trim())
    .map((f) => {
      // Only markers that are real search references count; the funder is dropped if none is.
      const cited = (Array.isArray(f.sources) ? f.sources : [])
        .map((k: unknown) => sources.get(String(k).replace(/[\[\]]/g, "")))
        .filter((x: any): x is { url: string; title: string } => !!x);
      const profile: any = {};
      for (const field of fields) profile[field] = f[field] ?? null;
      if (Array.isArray(profile.case_types)) profile.case_types = profile.case_types.filter((t: string) => (CASE_TYPES as readonly string[]).includes(t));
      if (Array.isArray(profile.jurisdictions)) profile.jurisdictions = profile.jurisdictions.map((j: string) => String(j).toUpperCase());
      else profile.jurisdictions = null;
      for (const k of ["min_claim_eur", "max_investment_eur"]) if (typeof profile[k] !== "number") profile[k] = null;
      for (const k of ["funds_collective_actions", "accepts_public_defendants"]) if (typeof profile[k] !== "boolean") profile[k] = null;
      if (typeof profile.website === "string" && !/^https?:\/\//.test(profile.website)) profile.website = null;
      return {
        id: randomUUID().slice(0, 8),
        name: f.name.trim(),
        origin: "discovered" as const,
        ...profile,
        contact: null,
        sources: [...new Map(cited.map((c: any) => [c.url, c])).values()],
        created_at: now,
      } as Funder;
    })
    .filter((f) => f.sources.length > 0);
}

// Save the web results on their own, then rebuild the combined list (legal team's list first).
export async function runDiscovery(): Promise<Funder[]> {
  const found = await discoverFunders();
  await writeJson("funders", "discovered.json", found);
  await rebuildFunders();
  return found;
}
