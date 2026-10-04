// Builds data/<id>/pages.json from decisions/<id>.pdf or decisions/<id>.txt.
// Usage: npm run pages [-- <id> ...] [-- --ocr]   (no ids = every file in decisions/)
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { pagesFromPdf, pagesFromText } from "../src/services/decisionText.ts";
import { ocrPdf } from "../src/services/mistral.ts";
import { writeJson } from "../src/services/storage.ts";

const args = process.argv.slice(2);
const forceOcr = args.includes("--ocr");
let ids = args.filter((a) => !a.startsWith("--"));
const files = await fs.readdir("decisions");
if (!ids.length) ids = files.filter((f) => /\.(pdf|txt)$/.test(f)).map((f) => f.replace(/\.(pdf|txt)$/, ""));

for (const id of ids) {
  const file = files.find((f) => f === `${id}.pdf` || f === `${id}.txt`);
  if (!file) {
    console.error(`✗ ${id}: no decisions/${id}.pdf or .txt`);
    continue;
  }
  const src = path.join("decisions", file);
  let pages, method;
  if (file.endsWith(".txt")) {
    pages = pagesFromText(await fs.readFile(src, "utf8"));
    method = "text-chunks";
  } else if (forceOcr) {
    pages = await ocrPdf(src);
    method = "ocr";
  } else {
    ({ pages, method } = await pagesFromPdf(src));
  }
  await writeJson(id, "pages.json", pages);
  const words = pages.reduce((n, p) => n + p.text.split(/\s+/).length, 0);
  console.log(`✓ ${id}: ${pages.length} pages, ${words} words via ${method} → data/${id}/pages.json`);
}
