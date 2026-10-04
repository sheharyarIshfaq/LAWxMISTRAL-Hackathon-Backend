import type { Page } from "./storage.ts";

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

// Walk any JSON value and set quote_verified on every object that has a "quote" field.
// If the quote is verbatim on exactly one other page, the model got the page wrong: fix it from the document.
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
        }
      }
    }
    for (const k of Object.keys(obj)) if (k !== "quote_verified") addQuoteFlags(obj[k], pages);
  }
  return value;
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
