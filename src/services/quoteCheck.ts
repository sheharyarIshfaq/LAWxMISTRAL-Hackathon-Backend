import type { Page } from "./storage.ts";
import { askJson } from "./mistral.ts";
import { withPageMarkers } from "./decisionText.ts";

// Make PDF text and model quotes comparable: case, apostrophes, quote marks, dashes,
// non-breaking spaces, words hyphenated across lines, markdown emphasis, whitespace.
export function normalize(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/[  ]/g, " ")
    .replace(/(\w)-\s*\n\s*(\w)/g, "$1$2")
    .replace(/[*_]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'.,;:\s]+|["'.,;:\s]+$/g, "");
}

// True if the quote appears verbatim on the cited page, or spans into an adjacent page.
export function quoteOk(quote: unknown, page: unknown, pages: Page[]): boolean {
  if (typeof quote !== "string" || typeof page !== "number") return false;
  const target = normalize(quote);
  if (target.length < 10) return false;
  const window = pages
    .filter((p) => Math.abs(p.page - page) <= 1)
    .sort((a, b) => a.page - b.page)
    .map((p) => p.text)
    .join("\n");
  return normalize(window).includes(target);
}

// Pages on which the quote appears verbatim.
function pagesContaining(quote: string, pages: Page[]): number[] {
  const target = normalize(quote);
  if (target.length < 10) return [];
  return pages.filter((p) => normalize(p.text).includes(target)).map((p) => p.page);
}

// Longest common subsequence of two word lists (small inputs: quotes are ≤ ~40 words).
function lcs(a: string[], b: string[]): number {
  const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

// A repair must never flip the meaning: negations and numbers must be identical.
const NEGATION = /^(ne|n'.*|pas|non|aucun|aucune|jamais|sans|ni|nullement|plus)$/;
function sameMeaningMarkers(a: string[], b: string[]): boolean {
  const markers = (ws: string[]) =>
    ws.flatMap((w) => [...(NEGATION.test(w) ? [w.startsWith("n'") ? "n'" : w] : []), ...(w.match(/\d+/g) ?? [])]).sort().join("|");
  return markers(a) === markers(b);
}

// The model sometimes rewords a quote slightly (e.g. "la société" for "elle"). Find the passage of the
// decision that matches at least 85% of the words in order, and return the decision's own text instead.
export function repairQuote(quote: string, pages: Page[], threshold = 0.85): { quote: string; page: number } | null {
  const q = normalize(quote).split(" ");
  if (q.length < 6) return null;
  let best: { score: number; quote: string; page: number } | null = null;
  for (const p of pages) {
    const words = p.text.split(/\s+/).filter(Boolean);
    const norm = words.map((w) => normalize(w));
    const qSet = new Set(q);
    for (let start = 0; start < words.length; start++) {
      if (!qSet.has(norm[start])) continue;
      for (const len of [q.length - 3, q.length - 2, q.length - 1, q.length, q.length + 1, q.length + 2, q.length + 3]) {
        if (len < 6 || start + len > words.length) continue;
        const window = norm.slice(start, start + len);
        const score = lcs(q, window) / Math.max(q.length, len);
        if (score >= threshold && sameMeaningMarkers(q, window) && (!best || score > best.score))
          best = { score, quote: words.slice(start, start + len).join(" "), page: p.page };
      }
    }
  }
  return best && { quote: best.quote, page: best.page };
}

// The model sometimes stitches sentences together or swaps a word for a name. Keep the longest run of
// consecutive words (at least 8) that appears verbatim in the decision, so the citation stays real.
function longestVerbatimPiece(quote: string, pages: Page[], minWords = 8): { quote: string; page: number } | null {
  const q = normalize(quote).split(" ");
  let best: { len: number; quote: string; page: number } | null = null;
  for (const p of pages) {
    const words = p.text.split(/\s+/).filter(Boolean);
    const norm = words.map((w) => normalize(w));
    const dp = new Array(norm.length + 1).fill(0);
    for (let i = 1; i <= q.length; i++) {
      for (let j = norm.length; j >= 1; j--) {
        dp[j] = q[i - 1] === norm[j - 1] ? dp[j - 1] + 1 : 0;
        if (dp[j] >= minWords && (!best || dp[j] > best.len))
          best = { len: dp[j], quote: words.slice(j - dp[j], j).join(" ").replace(/[,;:]$/, ""), page: p.page };
      }
    }
  }
  return best && { quote: best.quote, page: best.page };
}

// Walk any JSON value and set quote_verified on every object that has a "quote" field.
// If the quote is verbatim on exactly one other page, the model got the page wrong: fix it from the document.
// If it is slightly reworded, replace it with the decision's exact text.
export function addQuoteFlags<T>(value: T, pages: Page[]): T {
  if (Array.isArray(value)) value.forEach((v) => addQuoteFlags(v, pages));
  else if (value && typeof value === "object") {
    const obj = value as Record<string, any>;
    if ("quote" in obj) {
      obj.quote_verified = quoteOk(obj.quote, obj.page, pages);
      if (!obj.quote_verified && typeof obj.quote === "string") {
        const found = pagesContaining(obj.quote, pages);
        if (found.length === 1) {
          console.log(`  page corrected ${obj.page} → ${found[0]}: "${obj.quote.slice(0, 50)}…"`);
          obj.page = found[0];
          obj.quote_verified = true;
          obj.quote_fixed = "page_corrected";
        } else if (found.length === 0) {
          const fixed = repairQuote(obj.quote, pages);
          const piece = fixed ? null : longestVerbatimPiece(obj.quote, pages);
          const replacement = fixed ?? piece;
          if (replacement) {
            console.log(`  quote ${fixed ? "repaired" : "trimmed"} from decision text (p.${replacement.page}): "${obj.quote.slice(0, 50)}…" → "${replacement.quote.slice(0, 50)}…"`);
            obj.quote = replacement.quote;
            obj.page = replacement.page;
            obj.quote_verified = quoteOk(replacement.quote, replacement.page, pages);
            obj.quote_fixed = fixed ? "repaired" : "trimmed";
          }
        }
      }
    }
    for (const k of Object.keys(obj)) if (k !== "quote_verified") addQuoteFlags(obj[k], pages);
  }
  return value;
}

// Objects whose quote failed verification (for the re-quote pass).
export function failedQuoteObjects(value: unknown): Record<string, any>[] {
  const out: Record<string, any>[] = [];
  const walk = (v: any) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      if (v.quote && v.quote_verified === false) out.push(v);
      Object.values(v).forEach(walk);
    }
  };
  walk(value);
  return out;
}

// Count verified vs total quotes, for logging and the review report.
export function quoteStats(value: unknown): { verified: number; total: number; failed: string[] } {
  const stats = { verified: 0, total: 0, failed: [] as string[] };
  const walk = (v: any, path: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") {
      if ("quote_verified" in v && v.quote) {
        stats.total++;
        if (v.quote_verified) stats.verified++;
        else stats.failed.push(path);
      }
      for (const k of Object.keys(v)) walk(v[k], path ? `${path}.${k}` : k);
    }
  };
  walk(value, "");
  return stats;
}

// One extra model call for quotes that failed verification: ask for the exact passage, then check again.
export async function requoteFailed<T>(value: T, pages: Page[]): Promise<T> {
  const failed = failedQuoteObjects(value);
  if (!failed.length) return value;
  const unique = [...new Set(failed.map((o) => o.quote as string))];
  console.log(`  re-quoting ${unique.length} unverified quote(s)`);
  const system = `You fix citations to a French CNIL decision. Each item below is a quote that does NOT appear word for word in the decision. For each, find the passage of the decision that says the same thing and copy it exactly: one continuous passage, character for character, max 40 words, keeping pronouns and abbreviations as written. Give the number of the nearest [PAGE n] marker before it. If no passage says the same thing, return null for quote and page.
Return JSON: {"fixes": [{"i": 0, "quote": "", "page": 0}]}`;
  const user = `ITEMS:\n${JSON.stringify(unique.map((quote, i) => ({ i, quote })))}\n\nDECISION:\n${withPageMarkers(pages)}`;
  const { fixes = [] } = await askJson<{ fixes: { i: number; quote: string | null; page: number | null }[] }>(system, user);
  for (const fix of fixes) {
    if (!fix.quote || unique[fix.i] === undefined) continue;
    for (const o of failed.filter((o) => o.quote === unique[fix.i])) {
      o.quote = fix.quote;
      o.page = fix.page;
    }
  }
  return addQuoteFlags(value, pages);
}
