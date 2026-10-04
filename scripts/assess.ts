// Legal team's rules for victim identifiability and "is the harm quantified?" → data/<id>/assessments.json
// Usage: npm run assess -- <id>
import "dotenv/config";
import { refs, runAssessments } from "../src/services/assess.ts";

for (const id of process.argv.slice(2)) {
  const t0 = Date.now();
  const { identifiability: i, harm: h } = await runAssessments(id);
  const q = (o: any) => (o?.quote ? `${o.quote_verified ? "✓" : "✗"} ${o.paragraph ?? "?"} «${o.quote.slice(0, 90)}»` : "no quote");
  console.log(`✓ ${id} in ${((Date.now() - t0) / 1000).toFixed(0)}s → data/${id}/assessments.json\n`);
  console.log(`IDENTIFIABLE: ${i.level} — ${i.statement}${refs(i.list_holder, i.proof)}`);
  console.log(`  (a) list:  ${i.list_holder?.answer} — ${i.list_holder?.evidence}\n      ${q(i.list_holder)}`);
  console.log(`  (b) proof: ${i.proof?.answer} — ${i.proof?.evidence}\n      ${q(i.proof)}`);
  for (const s of i.subgroups ?? []) console.log(`  sub-group: ${s.group} → ${s.level} — ${s.evidence}\n      ${q(s)}`);
  for (const w of i.weakening ?? []) console.log(`  ⚠ weakening: "${w.wording}" — ${w.explanation}\n      ${q(w)}`);
  console.log(`\nHARM: ${h.level} — ${h.justification}${refs(h.quotes)}`);
  for (const x of h.quotes ?? []) console.log(`      ${q(x)}`);
  for (const s of h.subgroups ?? []) console.log(`  sub-group: ${s.group} → ${s.level} — ${s.justification}\n      ${q(s)}`);
}
