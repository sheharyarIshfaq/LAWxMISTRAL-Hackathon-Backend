import { buildParagraphs, labelMatches, locate, loose, type Paragraph } from "./paragraphs.ts";
import { decisionUrl, type Summary } from "./summary.ts";
import { readJson, readJsonOr, type Page } from "./storage.ts";

export const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT || 3001}`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const anchor = (p: Paragraph) => (p.n ? `p${p.n}` : p.label === "header" ? "header" : "operative");

// Link to our viewer, which scrolls to the paragraph and highlights the cited words.
export const viewerLink = (id: string, citationId: number, absolute = false) => `${absolute ? PUBLIC_URL : ""}/cases/${id}/decision?c=${citationId}#hl`;

// Wrap the cited words in <mark>, matching them word by word in the paragraph's own text (tolerant to line breaks
// and to the punctuation/apostrophe differences the quote checker also ignores).
function highlight(text: string, target: string): { html: string; found: boolean } {
  const words = text.split(/(\s+)/); // keep separators
  const tokens = words.map((w, i) => ({ w, i, n: /\s/.test(w) || !w ? "" : loose(w) })).filter((t) => t.n);
  const want = target.split(/\s+/).map((w) => loose(w)).filter(Boolean);
  for (let s = 0; s + want.length <= tokens.length; s++) {
    if (want.every((w, k) => tokens[s + k].n === w)) {
      const from = tokens[s].i;
      const to = tokens[s + want.length - 1].i;
      return {
        html: esc(words.slice(0, from).join("")) + `<mark id="hl">${esc(words.slice(from, to + 1).join(""))}</mark>` + esc(words.slice(to + 1).join("")),
        found: true,
      };
    }
  }
  return { html: esc(text), found: false };
}

// Full decision as an HTML page with § anchors; ?c=<summary citation id> or ?q=<words>&para=<§ N> highlights a passage.
export async function decisionPage(id: string, query: { c?: string; q?: string; para?: string }) {
  const pages = await readJson<Page[]>(id, "pages.json");
  const paragraphs = buildParagraphs(pages);
  const official = await decisionUrl(id);
  const caseJson = await readJsonOr<any>(id, "case.json", null);

  let target: string | null = query.q ?? null;
  let label: string | null = query.para ?? null;
  let verified: boolean | null = null;
  if (query.c) {
    const summary = await readJsonOr<Summary | null>(id, "summary.json", null);
    const c = summary?.citations.find((x) => x.id === Number(query.c));
    if (c) {
      target = c.quote ?? c.fragment;
      label = c.label;
      verified = c.verified;
    }
  }
  // The cited words decide the paragraph; else the label ("§ 10, 12" → § 10, "operative part, 2nd indent" → operative part).
  const firstN = Number(label?.match(/\d+/)?.[0]);
  const para =
    (target ? locate(target, paragraphs, label ?? undefined) : null) ??
    (label ? paragraphs.find((p) => labelMatches(label, p)) : undefined) ??
    (Number.isFinite(firstN) ? paragraphs.find((p) => p.n === firstN) : undefined) ??
    null;

  let highlighted = false;
  const body = paragraphs
    .map((p) => {
      let html = esc(p.text);
      if (p === para && target) {
        const h = highlight(p.text, target);
        html = h.html;
        highlighted = h.found;
      }
      return `<section id="${anchor(p)}" class="${p === para ? "cited" : ""}"><span class="lbl">${esc(p.label)} · p. ${p.page}</span><div class="txt">${html}</div></section>`;
    })
    .join("\n");

  const banner = para
    ? `<div class="banner">Cited passage: <b>${esc(para.label)}</b> (page ${para.page} of the Légifrance PDF)${
        verified === false ? ' · <span class="warn">⚠ this citation could not be verified</span>' : highlighted ? " · highlighted below" : ""
      }</div>`
    : target
      ? `<div class="banner"><span class="warn">⚠ The cited words were not found in the decision.</span></div>`
      : "";

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(caseJson?.decision?.reference ?? id)}</title>
<style>
:root { color-scheme: light; }
body { margin: 0; font: 15px/1.6 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1c2333; background: #f4f5f7; }
header { position: sticky; top: 0; background: #172238; color: #fff; padding: 12px 20px; display: flex; gap: 16px; align-items: center; justify-content: space-between; flex-wrap: wrap; z-index: 2; }
header h1 { font-size: 16px; margin: 0; } header a { color: #172238; background: #f0c05a; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 13px; }
.banner { background: #fff7e0; border-bottom: 1px solid #f0c05a; padding: 8px 20px; font-size: 14px; position: sticky; top: 48px; z-index: 1; }
.warn { color: #b42318; font-weight: 600; }
main { max-width: 860px; margin: 0 auto; padding: 16px 20px 60vh; }
section { background: #fff; border-radius: 6px; padding: 10px 14px; margin: 8px 0; scroll-margin-top: 110px; }
section.cited { outline: 2px solid #f0c05a; }
.lbl { font-size: 12px; color: #667085; font-weight: 600; } .txt { white-space: pre-line; }
mark { background: #ffe066; padding: 1px 2px; border-radius: 3px; scroll-margin-top: 140px; }
</style></head><body>
<header><h1>${esc(caseJson?.decision?.reference ?? id)} — ${esc(caseJson?.defendant?.name ?? "")}</h1>${official ? `<a href="${esc(official)}" target="_blank" rel="noopener">Open the official text on Légifrance ↗</a>` : ""}</header>
${banner}
<main>${body}</main>
<script>
  // Scroll to the highlighted words, or to the cited paragraph.
  const el = document.getElementById("hl") || document.querySelector("section.cited");
  if (el) el.scrollIntoView({ block: "center" });
</script>
</body></html>`;
}

// Text fragments ("#:~:text=") reserve "-", "," and "&": percent-encode them as well.
const enc = (t: string) => encodeURIComponent(t).replace(/-/g, "%2D");
const words = (t: string) => t.replace(/\s+/g, " ").trim().split(" ");

// Link to the official Légifrance text that scrolls to the cited passage. Légifrance only scrolls reliably to a
// fragment that is unique on the page, so for numbered paragraphs it starts at "N. first words of the paragraph"
// and ends at the last words of the cited passage (textStart,textEnd).
export function legifranceLink(url: string, c: { label: string; fragment: string | null; quote: string | null }, paragraphs: Paragraph[]): string {
  const target = c.fragment ?? c.quote;
  const para = (target ? locate(target, paragraphs, c.label) : null) ?? paragraphs.find((p) => labelMatches(c.label, p)) ?? null;
  if (para?.n) {
    const start = words(para.text).slice(0, 10);
    if (!target) return `${url}#:~:text=${enc(start.join(" "))}`;
    const t = words(target);
    // Cited words inside the opening words: the start alone covers them.
    if (loose(start.join(" ")).includes(loose(t.join(" ")))) return `${url}#:~:text=${enc(start.join(" "))}`;
    return `${url}#:~:text=${enc(start.slice(0, 8).join(" "))},${enc(t.slice(-4).join(" "))}`;
  }
  return target ? `${url}#:~:text=${enc(words(target).slice(0, 12).join(" "))}` : url;
}
