// Runs the PITCH step: data/<id>/case.json -> data/<id>/pitch.md (+ recovery.json, computed in code).
// Usage: npm run pitch -- <id> [<id> ...]
import "dotenv/config";
import { runPitch } from "../src/services/pipeline.ts";

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error("Usage: npm run pitch -- <id> [<id> ...]");
  process.exit(1);
}

for (const id of ids) {
  const t0 = Date.now();
  try {
    const { markdown, checks } = await runPitch(id);
    const words = markdown.replace(/^\|.*\|$/gm, "").split(/\s+/).filter(Boolean).length;
    const ok = checks.quotes.filter((q) => q.ok).length;
    console.log(`✓ ${id} in ${((Date.now() - t0) / 1000).toFixed(0)}s → data/${id}/pitch.md (${words} words outside the table)`);
    console.log(`  quotes in pitch verified: ${ok}/${checks.quotes.length}`);
    for (const q of checks.quotes.filter((q) => !q.ok)) console.log(`  ✗ p.${q.page} "${q.quote.slice(0, 70)}…"`);
    if (checks.unknown_numbers.length) console.log(`  ⚠ numbers not found in input: ${checks.unknown_numbers.join(", ")}`);
  } catch (err: any) {
    console.error(`✗ ${id}: ${err.message}`);
  }
}
