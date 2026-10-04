// Legal team's five scoring functions. Each returns { score 0-100, explanation } or { score: null, reason }
// when a required input is missing; a missing input is never replaced by a default value.

export type Score = { score: number; explanation: string; label?: "Low" | "Medium" | "Strong" } | { score: null; reason: string };

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const eurM = (n: number) => `€${(n / 1e6).toFixed(1)}M`;

// 1. VALUE OF THE CLAIM: 25 × log10(total / 100,000), clamped to [0, 100], rounded.
export function valueScore(totalBaseEur: number | null | undefined): Score {
  if (typeof totalBaseEur !== "number" || totalBaseEur <= 0) return { score: null, reason: "Base-scenario damages not available" };
  const score = Math.round(clamp(25 * Math.log10(totalBaseEur / 100_000)));
  return { score, explanation: `Base-scenario damages of ${eurM(totalBaseEur)}: 25 × log10(total / €100k).` };
}

// 2. VICTIMS: identifiable + proof of class membership + category + size.
export type VictimInputs = {
  identifiable: "yes" | "partly" | "no" | null;
  proof: "individual_notification" | "indirect" | "none" | null;
  notified_share?: number | null; // share of the group individually notified, when only part of it was
  other_proof?: "indirect" | "none" | null; // proof available to the others, in that case
  category: "consumers" | "employees" | "retail_investors" | "businesses" | null; // category with the most victims
  victims: number | null;
};
const PROOF_POINTS = { individual_notification: 30, indirect: 15, none: 0 };
const CATEGORY_POINTS = { consumers: 15, employees: 10, retail_investors: 10, businesses: 5 };

export function victimsScore(v: VictimInputs): Score {
  const missing = [
    v.identifiable ? null : "identifiability",
    v.proof ? null : "proof of class membership",
    v.category ? null : "victim category",
    typeof v.victims === "number" ? null : "number of victims",
  ].filter(Boolean);
  if (missing.length) return { score: null, reason: `Missing: ${missing.join(", ")}` };
  const identifiable = { yes: 40, partly: 20, no: 0 }[v.identifiable!];
  let proof = PROOF_POINTS[v.proof!];
  let proofText = v.proof!.replace(/_/g, " ");
  if (typeof v.notified_share === "number" && v.notified_share > 0 && v.notified_share < 1) {
    if (!v.other_proof) return { score: null, reason: "Only part of the group was notified, and the proof available to the others is not known" };
    proof = 30 * v.notified_share + PROOF_POINTS[v.other_proof] * (1 - v.notified_share);
    proofText = `${Math.round(v.notified_share * 100)}% individually notified, others ${v.other_proof}`;
  }
  const category = CATEGORY_POINTS[v.category!];
  const n = v.victims!;
  const size = n > 100_000 ? 15 : n >= 1_000 ? 10 : n >= 50 ? 5 : 0;
  const score = Math.round(identifiable + proof + category + size);
  return {
    score,
    explanation: `Identifiable ${v.identifiable} (${identifiable}) + proof: ${proofText} (${Math.round(proof)}) + ${v.category!.replace(/_/g, " ")} (${category}) + ${n.toLocaleString("en-US")} victims (${size}).`,
  };
}

// 3. DEFENDANT: base-scenario damages ÷ latest net income of the same legal entity.
export function defendantScore(totalBaseEur: number | null | undefined, netIncomeEur: number | null | undefined, entity?: string | null): Score {
  if (typeof totalBaseEur !== "number" || totalBaseEur <= 0) return { score: null, reason: "Base-scenario damages not available" };
  if (typeof netIncomeEur !== "number") return { score: null, reason: "Defendant's latest net income not available" };
  const who = entity ? ` of ${entity}` : "";
  if (netIncomeEur <= 0) return { score: 0, label: "Low", explanation: `Net income${who} is ${eurM(netIncomeEur)} (≤ 0): score 0.` };
  const ratio = (totalBaseEur / netIncomeEur) * 100;
  const raw = ratio < 10 ? 100 - 3 * ratio : ratio < 50 ? 70 - 0.75 * (ratio - 10) : ratio < 100 ? 40 - 0.8 * (ratio - 50) : 0;
  const score = Math.round(clamp(raw));
  const label = score >= 70 ? "Strong" : score >= 40 ? "Medium" : "Low";
  return { score, label, explanation: `Damages ${eurM(totalBaseEur)} ÷ net income${who} ${eurM(netIncomeEur)} = ${ratio.toFixed(1)}% → ${label}.` };
}

// 4. TYPE OF HARM: quantification + nature + recognition by the decision.
export type HarmInputs = {
  quantification: "quantified" | "quantifiable" | "to_be_proven" | null;
  natures: ("overcharge" | "financial" | "non_material" | "loss_of_chance")[] | null;
  recognition: "explicit" | "general" | "none" | null; // explicit = with a paragraph number
  paragraph?: string | null;
};
const NATURE_POINTS = { overcharge: 35, financial: 30, non_material: 20, loss_of_chance: 10 };

export function harmScore(h: HarmInputs): Score {
  const missing = [h.quantification ? null : "quantification", h.natures?.length ? null : "nature of the harm", h.recognition ? null : "recognition by the decision"].filter(Boolean);
  if (missing.length) return { score: null, reason: `Missing: ${missing.join(", ")}` };
  const q = { quantified: 40, quantifiable: 25, to_be_proven: 10 }[h.quantification!];
  const natures = [...new Set(h.natures!)];
  const nature = Math.min(35, Math.max(...natures.map((n) => NATURE_POINTS[n])) + (natures.length >= 2 ? 5 : 0));
  const r = { explicit: 25, general: 10, none: 0 }[h.recognition!];
  return {
    score: q + nature + r,
    explanation: `${h.quantification!.replace(/_/g, " ")} (${q}) + ${natures.map((n) => n.replace(/_/g, " ")).join(" + ")} (${nature}) + recognised ${h.recognition}${h.paragraph ? ` (${h.paragraph})` : ""} (${r}).`,
  };
}

// 5. TIMELINE: 0 if the limitation period has expired; else by estimated maximum duration of proceedings.
export function timelineScore(limitationEnds: string | null | undefined, maxDurationYears: number | null | undefined, today = new Date()): Score {
  if (!limitationEnds) return { score: null, reason: "Limitation period end date not provided (to be confirmed by counsel)" };
  const end = new Date(limitationEnds);
  if (Number.isNaN(end.getTime())) return { score: null, reason: `Limitation date "${limitationEnds}" is not a date` };
  if (end < today) return { score: 0, explanation: `Limitation period expired on ${limitationEnds}.` };
  if (typeof maxDurationYears !== "number") return { score: null, reason: "Estimated maximum duration of proceedings not provided" };
  const score = maxDurationYears < 5 ? 90 : maxDurationYears <= 10 ? 50 : 25;
  return { score, explanation: `Limitation not expired (ends ${limitationEnds}); proceedings up to ${maxDurationYears} years.` };
}
