import { normalize } from "./quoteCheck.ts";
import type { Page } from "./storage.ts";

// A CNIL decision is cited by numbered paragraph ("§ 21"), plus the header/recitals before § 1
// and the operative part ("PAR CES MOTIFS") at the end.
export type Paragraph = { label: string; n: number | null; page: number; text: string; norm: string; loose: string };

// Punctuation-insensitive form, for short text fragments ("connaissance, des données" = "connaissance des données").
export const loose = (s: string) => normalize(s).replace(/[,;:()«»"“”.!?]/g, " ").replace(/\s+/g, " ").trim();

// Does the label the model wrote point to this paragraph? ("operative part, 1st indent" → operative part, "recitals" → header)
export function labelMatches(cited: string, p: Paragraph): boolean {
  const c = normalize(cited);
  if (c === normalize(p.label)) return true;
  if (p.label === "operative part") return /operative|dispositif|par ces motifs|end of decision/.test(c);
  if (p.label === "header") return /header|recital|visa|vu /.test(c);
  return false;
}

export function buildParagraphs(pages: Page[]): Paragraph[] {
  const out: Paragraph[] = [];
  let current = { label: "header", n: null as number | null, page: pages[0]?.page ?? 1, lines: [] as string[] };
  let last = 0;
  const push = () => {
    const text = current.lines.join("\n").trim();
    if (text) out.push({ label: current.label, n: current.n, page: current.page, text, norm: normalize(text), loose: loose(text) });
  };
  for (const p of pages) {
    for (const line of p.text.split("\n")) {
      const m = line.match(/^\s*(\d{1,3})\.\s+\S/);
      if (m && Number(m[1]) === last + 1 && current.label !== "operative part") {
        push();
        last = Number(m[1]);
        current = { label: `§ ${last}`, n: last, page: p.page, lines: [line] };
      } else if (/^\s*PAR CES MOTIFS/.test(line)) {
        push();
        current = { label: "operative part", n: null, page: p.page, lines: [line] };
      } else current.lines.push(line);
    }
  }
  push();
  return out;
}

// The paragraph that contains this exact text (normalised), or null. Short phrases can appear in several
// paragraphs: keep the cited one if it contains the text, else the closest one to it.
export function locate(text: string, paragraphs: Paragraph[], citedLabel?: string): Paragraph | null {
  const t = loose(text);
  if (t.length < 4) return null;
  const hits = paragraphs.filter((p) => p.loose.includes(t));
  if (hits.length <= 1) return hits[0] ?? null;
  const same = citedLabel ? hits.find((p) => labelMatches(citedLabel, p)) : undefined;
  if (same) return same;
  const n = Number(citedLabel?.match(/\d+/)?.[0]);
  if (!Number.isFinite(n)) return hits[0];
  const pos = (p: Paragraph) => (p.n ?? (p.label === "header" ? 0 : 10_000));
  return hits.reduce((best, p) => (Math.abs(pos(p) - n) < Math.abs(pos(best) - n) ? p : best));
}

// The exact original words of the decision for a normalised match, so links can use the decision's own spelling.
export function originalWords(text: string, paragraph: Paragraph): string | null {
  const target = loose(text).split(" ");
  const words = paragraph.text.split(/\s+/).filter(Boolean).filter((w) => loose(w));
  const norm = words.map((w) => loose(w));
  for (let i = 0; i + target.length <= words.length; i++)
    if (target.every((w, k) => norm[i + k] === w)) return words.slice(i, i + target.length).join(" ");
  return null;
}
