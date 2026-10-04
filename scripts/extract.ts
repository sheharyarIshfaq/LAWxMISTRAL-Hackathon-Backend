// Runs the EXTRACT step: data/<id>/pages.json -> data/<id>/case.json, with quote_verified flags.
// Usage: npm run extract -- <id> [<id> ...]
import "dotenv/config";
import { runExtract } from "../src/services/pipeline.ts";
import { quoteStats } from "../src/services/quoteCheck.ts";

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error("Usage: npm run extract -- <id> [<id> ...]");
  process.exit(1);
}

for (const id of ids) {
  const t0 = Date.now();
  try {
    const c = await runExtract(id);
    const s = quoteStats(c);
    console.log(`✓ ${id} in ${((Date.now() - t0) / 1000).toFixed(0)}s → data/${id}/case.json`);
    console.log(`  quotes verified: ${s.verified}/${s.total}${s.failed.length ? `  ✗ ${s.failed.join(", ")}` : ""}`);
  } catch (err: any) {
    console.error(`✗ ${id}: ${err.message}`);
  }
}
