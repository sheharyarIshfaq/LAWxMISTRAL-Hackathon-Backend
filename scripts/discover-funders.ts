// Finds real litigation funders with a Mistral web-search agent and saves them to data/funders/funders.json
// (platform-registered funders are kept). Usage: npm run discover
import "dotenv/config";
import { runDiscovery } from "../src/services/discover.ts";

const t0 = Date.now();
const found = await runDiscovery();
console.log(`✓ ${found.length} funders discovered in ${((Date.now() - t0) / 1000).toFixed(0)}s → data/funders/funders.json`);
for (const f of found) {
  console.log(`\n• ${f.name}${f.website ? ` (${f.website})` : ""}`);
  console.log(`  FR: ${f.jurisdictions?.includes("FR") ?? "?"} · collective actions: ${f.funds_collective_actions ?? "?"} · types: ${f.case_types?.join(", ") ?? "?"} · min claim: ${f.min_claim_eur ?? "?"} · public defendants: ${f.accepts_public_defendants ?? "?"}`);
  for (const s of f.sources) console.log(`  ↳ ${s.url}`);
}
