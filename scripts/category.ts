// Classifies the decision into one row of the legal team's opt-in table (model picks the row, code does the maths).
// Usage: npm run category -- <id>   → data/<id>/category.json
import "dotenv/config";
import { runCategory } from "../src/services/category.ts";
import { computeRecovery, loadAssumptions } from "../src/services/recovery.ts";
import { readJson } from "../src/services/storage.ts";

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error("Usage: npm run category -- <id> [<id> ...]");
  process.exit(1);
}

for (const id of ids) {
  const t0 = Date.now();
  try {
    const c = await runCategory(id);
    console.log(`✓ ${id} in ${((Date.now() - t0) / 1000).toFixed(0)}s → data/${id}/category.json`);
    console.log(`  rule: ${c.rule}`);
    for (const m of c.matches) {
      console.log(`  ${m.category === c.category ? "→ CHOSEN" : "  match "} ${m.category}`);
      console.log(`             ${m.reason}`);
      console.log(`             ${m.quote_verified ? "✓" : "✗"} p.${m.page} «${m.quote}»`);
    }
    const caseJson = await readJson(id, "case.json");
    const r = computeRecovery(caseJson.breach?.people_affected, caseJson.breach?.people_affected_unit, c.category, await loadAssumptions());
    for (const s of r?.scenarios ?? []) console.log(`  ${s.name.padEnd(4)} ${(s.opt_in_rate * 100).toFixed(2)}% → ${s.opt_ins.toLocaleString("en-US")} opt-ins × €${s.compensation_per_victim_eur} = €${s.total_eur.toLocaleString("en-US")}`);
  } catch (err: any) {
    console.error(`✗ ${id}: ${err.message}`);
  }
}
