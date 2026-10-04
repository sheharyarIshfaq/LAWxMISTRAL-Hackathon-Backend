// Looks up the defendant's latest revenue on the web (Mistral web search) for the solvency calculation.
// Usage: npm run revenue -- <id>   → data/<id>/revenue.json
import "dotenv/config";
import { runRevenue } from "../src/services/solvency.ts";
import { loadBrief } from "../src/services/brief.ts";

for (const id of process.argv.slice(2)) {
  const t0 = Date.now();
  const r = await runRevenue(id);
  if (!r) {
    console.log(`✗ ${id}: no revenue found`);
    continue;
  }
  console.log(`✓ ${id} in ${((Date.now() - t0) / 1000).toFixed(0)}s: €${r.amount_eur.toLocaleString("en-US")} · ${r.entity} · ${r.year ?? "year?"} · from ${r.origin}${r.source ? ` · ${r.source.url}` : ""}`);
  const b = await loadBrief(id);
  console.log(`  solvency: ${b?.defendant.solvency.value} — ${b?.defendant.solvency.note}`);
}
