// Builds the PDF (funding brief + decision summary) from saved files.
// No model call. Usage: npm run report -- <id> [<id> ...]   → reports/<id>-funding-brief.pdf
import { readJsonOr } from "../src/services/storage.ts";
import { loadBrief } from "../src/services/brief.ts";
import { platformAssessment, type Scorecard } from "../src/services/scorecard.ts";
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
    const sc = await readJsonOr<Scorecard | null>(id, "scorecard.json", null);
    const summary = await readJsonOr(id, "summary.json", null);
    const html = await renderReportHtml({ ...brief, platform_assessment: platformAssessment(sc, brief) }, summary);
    const { pdfPath } = await printPdf(html, `reports/${id}-funding-brief.pdf`);
    console.log(`✓ ${id} → ${pdfPath}`);
  } catch (err: any) {
    console.error(`✗ ${id}: ${err.message}`);
  }
}
