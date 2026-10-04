// Runs the FUNDER CHECK: verifies every claim of the brief (+ summary) against the decision and scores the case.
// Usage: npm run check -- <id> [<id> ...]   → data/<id>/scorecard.json
import "dotenv/config";
import { runCheck } from "../src/services/scorecard.ts";

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error("Usage: npm run check -- <id> [<id> ...]");
  process.exit(1);
}

for (const id of ids) {
  const t0 = Date.now();
  try {
    const sc = await runCheck(id);
    const q = sc.claims.filter((c) => c.quote);
    console.log(`✓ ${id} in ${((Date.now() - t0) / 1000).toFixed(0)}s → data/${id}/scorecard.json`);
    console.log(`  claims: ${Object.entries(sc.counts).map(([k, v]) => `${v} ${k}`).join(", ")} | quotes verified ${q.filter((c) => c.quote_verified).length}/${q.length}`);
    for (const s of sc.scores) console.log(`  ${(s.rating ?? "none").padEnd(6)} ${s.criterion.padEnd(28)} ${s.quote ? (s.quote_verified ? "✓" : "✗") : " "} ${s.reason}`);
    for (const c of sc.claims.filter((c) => c.status === "overstated" || c.status === "unsupported")) console.log(`  ⚠ ${c.status}: ${c.claim}${c.note ? ` — ${c.note}` : ""}`);
    for (const f of sc.red_flags) console.log(`  🚩 ${f}`);
    console.log(`  summary: ${sc.summary}`);
  } catch (err: any) {
    console.error(`✗ ${id}: ${err.message}`);
  }
}
