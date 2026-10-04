import fs from "node:fs/promises";
import path from "node:path";
import { askText } from "./mistral.ts";
import { longestVerbatimPiece, normalize, repairQuote } from "./quoteCheck.ts";
import { withPageMarkers } from "./decisionText.ts";
import { buildParagraphs, labelMatches, locate, originalWords, type Paragraph } from "./paragraphs.ts";
import { readJson, writeJson, type Page } from "./storage.ts";

export const URL_PLACEHOLDER = "{{DECISION_URL}}";

export type Citation = {
  id: number;
  label: string; // what the summary cites, e.g. "§ 21" (corrected by code if wrong)
  cited_label: string; // what the model wrote
  page: number | null; // page of the Légifrance PDF where the passage is
  fragment: string | null; // exact words of the decision the link scrolls to
  quote: string | null; // French quotation just before the link, if any
  verified: boolean; // the fragment/quote was found in the decision, in that paragraph
  note: string | null;
};

export type Summary = { markdown: string; citations: Citation[] };

const SUMMARY_FORMAT = `
Tool notes:
- The decision text below has [PAGE n] markers from the PDF; they are not part of the decision. Cite paragraphs (§), never pages.
- The decision URL is provided as the literal text ${URL_PLACEHOLDER}: write every link as [§ N](${URL_PLACEHOLDER}#:~:text=...) and replace it with nothing else. The tool replaces it with the real URL.
- Add a text fragment to every link, not only to decisive facts: the tool uses it to check that the cited paragraph really contains the fact. The fragment is 3 to 6 consecutive words copied exactly as they appear in the decision (never a whole sentence, never reworded); URL-encoding is optional.
- Return only the Markdown summary, no preamble and no code fences.`;

const decode = (s: string) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
};

// Check every citation link in the summary against the decision, fix wrong § labels, and replace each
// link with a numbered citation marker [§ N](cite:ID) that the renderer turns into a real link.
export function verifyCitations(markdown: string, paragraphs: Paragraph[], pages: Page[]): Summary {
  const citations: Citation[] = [];
  const linkRe = /(?:(["“«])\s*([^"”»]{6,}?)\s*["”»]\s*(?:\[[^\]]*\]\s*)?)?\[([^\]]+)\]\(\{\{DECISION_URL\}\}(?:#:~:text=([^)\s]*))?\)/g;
  const out = markdown.replace(linkRe, (whole, _q, quoteRaw: string | undefined, label: string, frag: string | undefined) => {
    const id = citations.length + 1;
    const quote = quoteRaw ? quoteRaw.replace(/\*\*/g, "").trim() : null;
    const fragment = frag ? decode(frag).trim() : null;
    let para: Paragraph | null = null;
    let exact: string | null = null;
    let note: string | null = null;

    // 1. The text fragment (3-6 words) must be in the decision.
    if (fragment) {
      para = locate(fragment, paragraphs, label);
      if (para) exact = originalWords(fragment, para);
      else if (fragment.split(/\s+/).length > 6) {
        // Long, slightly reworded fragment: keep its longest run of real words (at least 5) as the anchor.
        const piece = longestVerbatimPiece(fragment, pages, 5);
        const pp = piece && locate(piece.quote, paragraphs, label);
        if (piece && pp) {
          para = pp;
          exact = originalWords(piece.quote, pp) ?? piece.quote;
          note = "Text fragment shortened to the decision's exact words.";
        }
      }
    }
    // 2. A French quotation before the link must be in the decision too (repaired if slightly reworded).
    let quoteOk = true;
    let quoteText = quote;
    if (quote && /[àâçéèêëîïôûùüÿœ']|\b(le|la|les|des|du|de|est|une|un|aux)\b/i.test(quote)) {
      const qp = locate(quote, paragraphs, label);
      if (qp) para ??= qp;
      else {
        const fixed = repairQuote(quote, pages);
        const fp = fixed && locate(fixed.quote, paragraphs, label);
        if (fixed && fp) {
          quoteText = fixed.quote;
          para ??= fp;
          note = "Quotation replaced with the decision's exact wording.";
        } else quoteOk = false;
      }
    } else quoteText = null; // English text in quotes, not a quotation of the decision

    // 3. No fragment and no quotation: nothing to check the label against.
    const verified = Boolean(para) && quoteOk;
    const finalLabel = para && !labelMatches(label.trim(), para) ? para.label : label.trim();
    if (para && finalLabel !== label.trim()) note = `${note ? note + " " : ""}Model cited ${label.trim()}; the passage is in ${para.label}.`;
    if (!quoteOk) note = `${note ? note + " " : ""}Quotation not found in the decision.`;
    if (!para && !fragment && !quote) note = "No quotation or text fragment to check this citation against.";
    else if (!para && quoteOk) note = `${note ? note + " " : ""}Text fragment not found in the decision.`;

    citations.push({ id, label: finalLabel, cited_label: label.trim(), page: para?.page ?? null, fragment: exact ?? fragment, quote: quoteText, verified, note });
    let before = whole.slice(0, whole.lastIndexOf("["));
    if (quote && quoteText && quoteText !== quote) before = before.replace(quote, quoteText);
    return `${before}[${finalLabel}](cite:${id})`;
  });
  return { markdown: out, citations };
}

// Turn cite:ID markers into links: the official URL (+ text fragment) when known, else the local decision PDF page,
// or plain "(§ N)" for print. Unverified citations get a visible warning.
// Turn cite:ID markers into links. `viewer`: our decision viewer, which scrolls to the paragraph and highlights the
// cited words (reliable; Légifrance loads its text with JavaScript, so its #:~:text= highlights do not work).
// `url`: official Légifrance page. `plain`: "(§ N)" without a link. Unverified citations get a visible warning.
export function renderCitations(summary: Summary, opts: { url?: string | null; viewer?: (citationId: number) => string; plain?: boolean }): string {
  const byId = new Map(summary.citations.map((c) => [c.id, c]));
  return summary.markdown.replace(/\[([^\]]+)\]\(cite:(\d+)\)/g, (_m, label: string, cid: string) => {
    const c = byId.get(Number(cid));
    const warn = c && !c.verified ? " ⚠" : "";
    const href = opts.viewer ? opts.viewer(Number(cid)) : opts.url ?? null;
    return opts.plain || !href ? `(${label}${warn})` : `[${label}${warn}](${href})`;
  });
}

export async function generateSummary(pages: Page[]): Promise<Summary> {
  const system = `${await fs.readFile(path.resolve("prompts/summary.txt"), "utf8")}\n${SUMMARY_FORMAT}`;
  let markdown = await askText(system, `DECISION_URL: ${URL_PLACEHOLDER}\n\nDECISION:\n${withPageMarkers(pages)}`, 0);
  markdown = markdown.replace(/^```(?:markdown)?\n?|\n?```$/g, "").trim();
  return verifyCitations(markdown, buildParagraphs(pages), pages);
}

export async function runSummary(id: string) {
  const pages = await readJson<Page[]>(id, "pages.json");
  const summary = await generateSummary(pages);
  await writeJson(id, "summary.json", summary);
  return summary;
}

export async function decisionUrl(id: string): Promise<string | null> {
  try {
    const all = JSON.parse(await fs.readFile(path.resolve("config/decisions.json"), "utf8"));
    return all[id]?.url ?? null;
  } catch {
    return null;
  }
}
