// Checks the five scoring functions against the legal team's test case and boundary checks.
// Usage: npm run test-scores
import { defendantScore, harmScore, timelineScore, valueScore, victimsScore, type Score } from "../src/services/scores.ts";

let fail = 0;
const eq = (name: string, s: Score, want: number | null, label?: string) => {
  const ok = s.score === want && (!label || ("label" in s && s.label === label));
  if (!ok) fail++;
  console.log(`${ok ? "✓" : "✗"} ${name.padEnd(34)} got ${s.score}${"label" in s && s.label ? ` (${s.label})` : ""}, want ${want}${label ? ` (${label})` : ""} — ${"explanation" in s ? s.explanation : s.reason}`);
};

console.log("Value checks");
for (const [v, w] of [[100_000, 0], [1_000_000, 25], [10_000_000, 50], [100_000_000, 75], [1_000_000_000, 100]] as const) eq(`value ${v.toLocaleString("en-US")}`, valueScore(v), w);

console.log("\nFree Mobile test case (legal team)");
eq("Value of the claim", valueScore(58_400_000), 69);
eq("Victims", victimsScore({ identifiable: "yes", proof: "individual_notification", category: "consumers", victims: 19_400_000 }), 100);
eq("Defendant", defendantScore(58_400_000, 730_000_000, "Free Mobile"), 76, "Strong");
eq("Type of harm", harmScore({ quantification: "to_be_proven", natures: ["financial", "non_material"], recognition: "explicit", paragraph: "§ 82" }), 70);
eq("Timeline", timelineScore("2029-10-21", 4), 90);

console.log("\nMissing inputs are never defaulted");
eq("value without damages", valueScore(null), null);
eq("defendant without net income", defendantScore(58_400_000, null), null);
eq("timeline without limitation date", timelineScore(null, 4), null);
eq("expired limitation", timelineScore("2020-01-01", 4), 0);
eq("net income negative", defendantScore(2_200_000, -5_200_000), 0, "Low");

console.log(fail ? `\n${fail} check(s) failed` : "\nAll checks passed");
process.exit(fail ? 1 : 0);
