// Builds the review pack PDF (funding brief + decision summary + verification appendix) from saved files.
// No model call. Usage: npm run report -- <id> [<id> ...]   → reports/<id>-funding-brief.pdf
import { readJson, readJsonOr } from "../src/services/storage.ts";
import { applyEdits, type Brief } from "../src/services/brief.ts";
import { printPdf, renderReportHtml } from "../src/services/report.ts";

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error("Usage: npm run report -- <id> [<id> ...]");
  process.exit(1);
}

for (const id of ids) {
  try {
    const brief = await readJson<Brief>(id, "brief.json");
    const edits = await readJsonOr<Record<string, unknown>>(id, "brief-edits.json", {});
    const summary = await readJsonOr(id, "summary.json", null);
    const html = await renderReportHtml(applyEdits(brief, edits), summary, { decisionFile: `decisions/${id}.pdf` });
    const { pdfPath } = await printPdf(html, `reports/${id}-funding-brief.pdf`);
    console.log(`✓ ${id} → ${pdfPath}`);
  } catch (err: any) {
    console.error(`✗ ${id}: ${err.message}`);
  }
}
