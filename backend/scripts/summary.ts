// Runs the SUMMARY step (legal team's prompt): data/<id>/pages.json -> data/<id>/summary.json
// (Markdown with § citations, each checked against the decision by code).
// Usage: npm run summary -- <id> [<id> ...]
import "dotenv/config";
import { runSummary } from "../src/services/summary.ts";

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error("Usage: npm run summary -- <id> [<id> ...]");
  process.exit(1);
}

for (const id of ids) {
  const t0 = Date.now();
  try {
    const { markdown, citations } = await runSummary(id);
    const ok = citations.filter((c) => c.verified).length;
    const relabelled = citations.filter((c) => c.label !== c.cited_label).length;
    console.log(`✓ ${id} in ${((Date.now() - t0) / 1000).toFixed(0)}s → data/${id}/summary.json (${markdown.split(/\s+/).length} words)`);
    console.log(`  citations verified: ${ok}/${citations.length} | § corrected by code: ${relabelled}`);
    for (const c of citations.filter((c) => !c.verified || c.note)) console.log(`  ${c.verified ? "✓" : "✗"} [${c.cited_label}→${c.label}] ${c.note ?? ""} ${c.quote ? `«${c.quote.slice(0, 60)}»` : c.fragment ? `#${c.fragment}` : ""}`);
  } catch (err: any) {
    console.error(`✗ ${id}: ${err.message}`);
  }
}
