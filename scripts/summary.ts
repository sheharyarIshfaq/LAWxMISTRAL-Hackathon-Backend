// Runs the SUMMARY step: data/<id>/pages.json -> data/<id>/summary.json, every sentence with a checked quote.
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
    const { sentences } = await runSummary(id);
    const ok = sentences.filter((s) => s.quote_verified).length;
    console.log(`✓ ${id} in ${((Date.now() - t0) / 1000).toFixed(0)}s → data/${id}/summary.json (quotes verified ${ok}/${sentences.length})`);
    for (const s of sentences) console.log(`  ${s.quote_verified ? "✓" : "✗"} p.${s.page}  ${s.text}`);
  } catch (err: any) {
    console.error(`✗ ${id}: ${err.message}`);
  }
}
