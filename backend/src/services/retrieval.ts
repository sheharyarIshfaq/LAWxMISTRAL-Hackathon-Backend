import { mistral } from "./mistral.ts";
import { buildParagraphs, type Paragraph } from "./paragraphs.ts";
import { readJsonOr, writeJson, type Page } from "./storage.ts";

// Long decisions (e.g. a 153-page European Commission decision) take the model ~40 s to read in full before it
// answers. For those, the agent reads only the passages closest to the question (semantic search with Mistral
// embeddings) plus the header and the operative part. Quotes are still checked against the full decision.
export const EMBED_MODEL = "mistral-embed";
export const LONG_DECISION_PAGES = 60;
const TOP_K = 30;
const MAX_CHARS = 6000; // per passage sent to the embedding model

type Cache = { model: string; labels: string[]; vectors: number[][] };

const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0) / (norm(a) * norm(b));

async function embed(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 32) {
    const res = await mistral().embeddings.create({ model: EMBED_MODEL, inputs: texts.slice(i, i + 32).map((t) => t.slice(0, MAX_CHARS)) });
    out.push(...res.data.map((d) => d.embedding as number[]));
  }
  return out;
}

// One embedding per paragraph, computed once and saved in data/<id>/embeddings.json.
async function paragraphVectors(id: string, paragraphs: Paragraph[]): Promise<Cache> {
  const labels = paragraphs.map((p) => p.label);
  const cached = await readJsonOr<Cache | null>(id, "embeddings.json", null);
  if (cached && cached.model === EMBED_MODEL && cached.labels.join("|") === labels.join("|")) return cached;
  const cache = { model: EMBED_MODEL, labels, vectors: await embed(paragraphs.map((p) => p.text)) };
  await writeJson(id, "embeddings.json", cache);
  return cache;
}

// The passages of the decision closest to the question, in document order, each with its [PAGE n] marker so the
// model can cite pages as usual. Always includes the header and the operative part.
export async function relevantPassages(id: string, pages: Page[], query: string) {
  const paragraphs = buildParagraphs(pages);
  const cache = await paragraphVectors(id, paragraphs);
  const [q] = await embed([query]);
  const ranked = paragraphs.map((p, i) => ({ i, score: cosine(q, cache.vectors[i]) })).sort((a, b) => b.score - a.score);
  const keep = new Set(ranked.slice(0, TOP_K).map((r) => r.i));
  paragraphs.forEach((p, i) => (p.label === "header" || p.label === "operative part") && keep.add(i));
  const chosen = [...keep].sort((a, b) => a - b).map((i) => paragraphs[i]);
  const text = chosen.map((p) => `[PAGE ${p.page}]\n${p.text}`).join("\n\n[…]\n\n");
  const numbered = paragraphs.filter((p) => p.n !== null).length;
  return { text, count: chosen.filter((p) => p.n !== null).length, total: numbered, kind: paragraphs.some((p) => p.label.startsWith("recital")) ? "recitals" : "paragraphs" };
}
