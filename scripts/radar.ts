// Scans the CNIL sanctions list and triages every decision. Usage: npm run radar
import { scan } from "../src/services/radar.ts";

const t0 = Date.now();
const feed = await scan();
const by = (s: string) => feed.items.filter((i) => i.status === s);
console.log(`✓ ${feed.items.length} CNIL sanctions scanned in ${((Date.now() - t0) / 1000).toFixed(1)}s${feed.from_cache ? " (from saved copy)" : ""} → data/radar/feed.json`);
console.log(`  data breaches: ${feed.items.filter((i) => i.data_breach).length} · candidates: ${by("candidate").length} · public-body candidates: ${by("candidate_public").length} · filtered: ${by("filtered").length} · new: ${feed.new_count}`);
console.log("\nCandidates (high and medium priority):");
for (const i of feed.items.filter((i) => i.priority === "high" || i.priority === "medium"))
  console.log(`  ${i.date} ${(i.priority ?? "").padEnd(6)} ${i.status.padEnd(16)} ${(i.fine_eur ? "€" + i.fine_eur.toLocaleString("en-US") : "—").padEnd(14)} ${i.organisation_type.slice(0, 40).padEnd(40)} ${i.case_id ? "→ " + i.case_id : ""}`);
