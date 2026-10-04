// Builds the PDF (funding brief + decision summary) from saved files.
// No model call. Usage: npm run report -- <id> [<id> ...]   → reports/<id>-funding-brief.pdf
import { readJsonOr } from "../src/services/storage.ts";
import { loadBrief } from "../src/services/brief.ts";
import { renderCitations, type Summary } from "../src/services/summary.ts";
import { viewerLink } from "../src/services/viewer.ts";
import { printPdf, renderReportHtml } from "../src/services/report.ts";

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error("Usage: npm run report -- <id> [<id> ...]");
  process.exit(1);
}

for (const id of ids) {
  try {
    const brief = await loadBrief(id);
    if (!brief) throw new Error("no brief yet");
    const summary = await readJsonOr<Summary | null>(id, "summary.json", null);
    // Funder check (platform assessment) left out of the PDF for now.
    const html = await renderReportHtml(brief, summary ? renderCitations(summary, { viewer: (c) => viewerLink(id, c, true) }) : null);
    const { pdfPath } = await printPdf(html, `reports/${id}-funding-brief.pdf`);
    console.log(`✓ ${id} → ${pdfPath}`);
  } catch (err: any) {
    console.error(`✗ ${id}: ${err.message}`);
  }
}
