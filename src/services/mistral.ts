import fs from "node:fs/promises";
import path from "node:path";
import { Mistral } from "@mistralai/mistralai";
import type { Page } from "./storage.ts";

export const OCR_MODEL = "mistral-ocr-latest";

let client: Mistral | null = null;

export function mistral(): Mistral {
  if (!process.env.MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY is not set in .env");
  client ??= new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
  return client;
}

// OCR a PDF from a public URL or a local file path. Returns one entry per PDF page.
export async function ocrPdf(source: string): Promise<Page[]> {
  let document;
  if (/^https?:\/\//.test(source)) {
    document = { type: "document_url" as const, documentUrl: source };
  } else {
    const uploaded = await mistral().files.upload({
      file: { fileName: path.basename(source), content: await fs.readFile(source) },
      purpose: "ocr",
    });
    document = { type: "file" as const, fileId: uploaded.id };
  }
  const res = await mistral().ocr.process({ model: OCR_MODEL, document });
  return res.pages.map((p) => ({ page: p.index + 1, text: p.markdown }));
}
