import { labelMatches, locate, loose, type Paragraph } from "./paragraphs.ts";

// Text fragments ("#:~:text=") reserve "-", "," and "&": percent-encode them as well.
const enc = (t: string) => encodeURIComponent(t).replace(/-/g, "%2D");
const words = (t: string) => t.replace(/\s+/g, " ").trim().split(" ");

// Link to the official Légifrance text that scrolls to the cited passage. Légifrance only scrolls reliably to a
// fragment that is unique on the page, so for numbered paragraphs it starts at "N. first words of the paragraph"
// and ends at the last words of the cited passage (textStart,textEnd).
// For a decision published as a PDF (e.g. European Commission), the link opens the PDF at the page of the passage.
export function legifranceLink(url: string, c: { label: string; fragment: string | null; quote: string | null }, paragraphs: Paragraph[]): string {
  const target = c.fragment ?? c.quote;
  const para = (target ? locate(target, paragraphs, c.label) : null) ?? paragraphs.find((p) => labelMatches(c.label, p)) ?? null;
  if (/\.pdf($|\?)/i.test(url)) {
    return para?.page ? `${url}#page=${para.page}` : url;
  }
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

