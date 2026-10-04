import fs from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";
import { ocrPdf } from "./mistral.ts";
import type { Page } from "./storage.ts";

// Légifrance PDFs printed from the browser have a text layer: read it directly, exact and free.
export async function pagesFromPdfFile(filePath: string): Promise<Page[]> {
  const pdf = await getDocumentProxy(new Uint8Array(await fs.readFile(filePath)));
  const { text } = await extractText(pdf, { mergePages: false });
  return text.map((t, i) => ({ page: i + 1, text: t.trim() }));
}

// Pasted decision text: split on paragraph boundaries into ~wordsPerPage chunks that stand in for pages.
export function pagesFromText(text: string, wordsPerPage = 500): Page[] {
  const paragraphs = text.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const pages: Page[] = [];
  let current: string[] = [];
  let words = 0;
  for (const para of paragraphs) {
    const n = para.split(/\s+/).length;
    if (words > 0 && words + n > wordsPerPage) {
      pages.push({ page: pages.length + 1, text: current.join("\n\n") });
      current = [];
      words = 0;
    }
    current.push(para);
    words += n;
  }
  if (current.length) pages.push({ page: pages.length + 1, text: current.join("\n\n") });
  return pages;
}

// A PDF with no text layer (a scan) yields empty pages; fall back to Mistral OCR.
export async function pagesFromPdf(source: string): Promise<{ pages: Page[]; method: "text-layer" | "ocr" }> {
  if (!/^https?:\/\//.test(source)) {
    const pages = await pagesFromPdfFile(source);
    const words = pages.reduce((n, p) => n + p.text.split(/\s+/).filter(Boolean).length, 0);
    if (words > 50 * pages.length) return { pages, method: "text-layer" };
  }
  return { pages: await ocrPdf(source), method: "ocr" };
}

export function withPageMarkers(pages: Page[]): string {
  return pages.map((p) => `[PAGE ${p.page}]\n${p.text}`).join("\n\n");
}
