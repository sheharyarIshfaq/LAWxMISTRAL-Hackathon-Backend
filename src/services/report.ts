import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Brief, Field } from "./brief.ts";
import type { SummarySentence } from "./summary.ts";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const blank = (label = " ") => `<span class="blank">[${esc(label)}]</span>`;
const eurM = (n: number) => (n >= 1e9 ? `€${(n / 1e9).toFixed(1)}bn` : n >= 1e6 ? `€${(n / 1e6).toFixed(1)}M` : `€${n.toLocaleString("en-US")}`);
const num = (n: number) => n.toLocaleString("en-US");
const pct = (n: number) => `${+(n * 100).toFixed(2)}%`;
const MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
const day = (d?: string | null) => {
  if (!d) return "";
  const [y, m, dd] = d.split("-").map(Number);
  return `${dd} ${MONTHS[m - 1]} ${y}`;
};
const monthSpan = (a?: string, b?: string) => {
  if (!a) return "";
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = (b ?? a).split("-").map(Number);
  return ya === yb && ma === mb ? `${MONTHS[ma - 1]} ${ya}` : ya === yb ? `${MONTHS[ma - 1]}–${MONTHS[mb - 1]} ${ya}` : `${MONTHS[ma - 1]} ${ya}–${MONTHS[mb - 1]} ${yb}`;
};

const chips = (options: [string, string][], selected: string | string[] | null, cls = "") => {
  const sel = new Set(Array.isArray(selected) ? selected : selected ? [selected] : []);
  return `<div class="chips">${options.map(([v, l]) => `<span class="chip ${cls} ${sel.has(v) ? "on" : ""}">${sel.has(v) ? "☑" : "☐"} ${esc(l)}</span>`).join("")}</div>`;
};

const SOURCE_LABEL: Record<string, string> = {
  decision: "CNIL decision",
  assessment: "AI assessment",
  computed: "Computed",
  assumption: "Assumption",
  association: "Association",
  missing: "To be provided",
};
const tag = (f?: Field) => (f ? `<span class="tag t-${f.source}">${SOURCE_LABEL[f.source]}</span>` : "");
const check = (f: { quote_verified?: boolean; quote_fixed?: string }) =>
  f.quote_verified
    ? f.quote_fixed === "trimmed" || f.quote_fixed === "repaired"
      ? `<span class="ok warn">✓ verbatim · ${f.quote_fixed} by code, check support</span>`
      : `<span class="ok">✓ verbatim${f.quote_fixed === "page_corrected" ? " · page corrected" : ""}</span>`
    : `<span class="bad">✗ not found in decision</span>`;
const cite = (f?: { quote?: string | null; page?: number | null; quote_verified?: boolean; quote_fixed?: string }) =>
  f?.quote ? `<div class="cite">« ${esc(f.quote)} » <b>(p. ${f.page})</b> ${check(f)}</div>` : "";

function card(title: string, icon: string, cls: string, body: string) {
  return `<section class="card ${cls}"><h2>${esc(title)}<span class="icon">${icon}</span></h2><div class="body">${body}</div></section>`;
}

export async function renderReportHtml(brief: Brief, summary: { sentences: SummarySentence[] } | null) {
  const b = brief;
  const people = b.victims.number.value as number | null;
  const unit = b.victims.number.note;
  const scenarios = (b.value.scenarios.value as any[] | null) ?? [];
  const mid = scenarios.find((s) => s.name === "mid");
  const legal = (b.header.legal_basis.value as any[] | null) ?? [];
  const funding = b.value.funding_sought_eur.value as number | null;
  const assoc = b.association.name.value as string | null;
  const facts = b.timeline.facts.value as { start?: string; end?: string } | null;
  const revenue = b.defendant.revenue.value as { amount_eur: number; entity: string; year: number } | null;
  const today = new Date().toISOString().slice(0, 10);

  const header = `
  <header class="hero">
    <div class="eyebrow"><span>FUNDING BRIEF · COLLECTIVE REDRESS ACTION</span><span>Confidential · ${day(today)}</span></div>
    <h1>${esc(b.header.action_name.value)}</h1>
    <p class="lede">${assoc ? esc(assoc) : blank("Association")}, a certified consumer association, seeks
      <span class="gold">${funding ? eurM(funding) : "€[ to be set ]"}</span> to fund a French collective damages action (action de groupe)
      against ${esc(b.header.defendant.value)} on behalf of ${people ? num(people) : blank("number")} victims${people && unit && unit !== "persons" ? ` (counted as ${esc(unit)} by the CNIL)` : ""}.</p>
    <div class="pills">
      <span class="pill">Source decision: ${esc((b.header.source_decision.value as any)?.authority)} ${esc((b.header.source_decision.value as any)?.reference)}</span>
      <span class="pill">Legal basis: ${legal.map((l) => esc(l.article)).join(", ") || "—"}</span>
      <span class="pill">Status: ${b.header.status.value ? esc(b.header.status.value) : "appeal status not stated in the decision"}</span>
    </div>
    <div class="draft">DRAFT FOR LEGAL REVIEW · generated from the CNIL decision · every quote is checked word for word against the decision · values in [brackets] are to be provided</div>
  </header>`;

  const harm = card("Type of harm", "🛡", "c-harm", `
    <div class="label">Is the harm quantified? ${tag(b.harm.quantified)}</div>
    ${chips([["quantified", "Quantified"], ["quantifiable", "Quantifiable"], ["to_be_proven", "To be proven"]], b.harm.quantified.value as string)}
    <div class="label">Nature ${tag(b.harm.nature)}</div>
    ${chips([["financial", "Financial"], ["non_material", "Non-material"], ["overcharge", "Overcharge"], ["loss_of_chance", "Loss of chance"]], b.harm.nature.value as string[], "soft")}
    <p>${esc(b.harm.description.value) || blank("Description of the harm")}</p>
    ${cite(b.harm.description)}`);

  const victims = card("Victims", "👥", "c-victims", `
    <div class="duo">
      <div class="box"><div class="label">Number ${tag(b.victims.number)}</div><div class="big">${people ? num(people) : "[ ]"}</div><div class="muted">${esc(unit ?? "")}</div></div>
      <div class="box"><div class="label">Identifiable? ${tag(b.victims.identifiable)}</div>${chips([["yes", "Yes"], ["partly", "Partly"], ["no", "No"]], b.victims.identifiable.value as string, "plain")}</div>
    </div>
    ${cite(b.victims.number)}
    <div class="label">Category ${tag(b.victims.categories)}</div>
    ${chips([["consumers", "Consumers"], ["businesses", "Businesses"], ["retail_investors", "Retail investors"], ["employees", "Employees"], ["other", "Other"]], b.victims.categories.value as string[], "soft")}
    <p><b>Proof of class membership:</b> ${esc(b.victims.proof_of_membership.value) || blank("document")} ${tag(b.victims.proof_of_membership)}</p>
    ${(b.victims.subgroups.value as string[] | null)?.length ? `<p class="muted">Subgroups: ${(b.victims.subgroups.value as string[]).map(esc).join("; ")}</p>` : ""}
    ${cite(b.victims.identifiable)}`);

  const defendant = card("Defendant", "🏛", "c-defendant", `
    <div class="label">Nature ${tag(b.defendant.nature)}</div>
    ${chips([["private_company", "Private company"], ["listed_group", "Listed group"], ["public_body", "Public body"], ["association_or_union", "Association or union"]], b.defendant.nature.value as string[], "soft")}
    <div class="label">Solvency ${tag(b.defendant.solvency)}</div>
    ${chips([["low", "Low"], ["medium", "Medium"], ["strong", "Strong"]], b.defendant.solvency.value as string, "wide")}
    ${b.defendant.solvency.note ? `<p class="muted">${esc(b.defendant.solvency.note)}</p>` : ""}
    <p><b>Indicators:</b> revenue ${revenue ? `${eurM(revenue.amount_eur)} (${esc(revenue.entity)}, ${revenue.year})` : blank()}, group ${esc(b.defendant.group.value) || blank()},
      insurance ${blank()}, competent court ${esc(b.defendant.competent_court.value) || blank("civil / administrative")} ${tag(b.defendant.competent_court)}</p>
    ${cite(b.defendant.revenue)}`);

  const value = card("Value of the claim", "€", "c-value", `
    <p>${esc(b.value.formula)} ${tag(b.value.scenarios)}</p>
    <table class="scen"><thead><tr><th>Scenario</th><th>Opt-ins</th><th>€ / victim</th><th>Total</th></tr></thead><tbody>
      ${scenarios.map((s) => `<tr><td>${s.name === "mid" ? "Base" : s.name[0].toUpperCase() + s.name.slice(1)} <span class="muted">(${pct(s.opt_in_rate)})</span></td><td>${num(s.opt_ins)}</td><td>€${num(s.compensation_per_victim_eur)}</td><td><b>${eurM(s.total_eur)}</b></td></tr>`).join("") || `<tr><td colspan="4">${blank("cannot be computed")}</td></tr>`}
    </tbody></table>
    <div class="duo">
      <div class="box dark"><div class="label">Funding sought</div><div class="big">${funding ? eurM(funding) : "€[ ]M"}</div></div>
      <div class="box light"><div class="label">Funder's share ${tag(b.value.funder_share)}</div><div class="big">${b.value.funder_share.value != null ? pct(b.value.funder_share.value as number) : "[ ] %"}</div></div>
    </div>
    <p class="muted">${esc(b.value.scenarios.note)}. ${esc(b.value.benchmarks_note.value)}</p>`);

  const steps: [string, string, string][] = [
    ["Facts", facts ? monthSpan(facts.start, facts.end) : "", "decision"],
    ["Source decision", day(b.timeline.source_decision.value as string), "decision"],
    ["Filing", String(b.timeline.filing.value ?? ""), "target date"],
    ["Judgment on liability", String(b.timeline.judgment_on_liability.value ?? ""), "estimate"],
    ["Victims opt in", String(b.timeline.victims_opt_in.value ?? ""), "period"],
    ["Compensation paid", String(b.timeline.compensation_paid.value ?? ""), "estimate"],
  ];
  const timeline = `
  <section class="card c-timeline full"><h2>Timeline<span class="right">Expected duration: <b>${esc(b.timeline.expected_duration_years.value) || "[ ]"} years</b> · Limitation period ends: <b>${esc(b.timeline.limitation_ends.value) || "[date]"}</b></span></h2>
    <div class="body"><div class="steps">${steps.map(([l, v, ph], i) => `<div class="step"><div class="bar" style="opacity:${0.35 + i * 0.13}"></div><b>${l}</b><div class="mono">${v ? esc(v) : `[${ph}]`}</div></div>`).join("")}</div>
    ${cite(b.timeline.facts)}</div></section>`;

  const fw = b.framework;
  const box = (f: Field, l: string) => `<div>${f.value ? "☑" : "☐"} ${l}</div>`;
  const footer = `
  <section class="footer">
    <div><div class="eyebrow">FUNDING FRAMEWORK · ART. 16, FRENCH LAW OF 30 APRIL 2025</div>
      ${box(fw.no_funder_influence, "No funder influence over the conduct of the action")}
      ${box(fw.funding_publicly_disclosed, "Funding publicly disclosed")}
      ${box(fw.conflict_of_interest_policy, "Written conflict-of-interest policy")}
      ${box(fw.funder_has_no_ties_to_defendant, "Funder has no ties to the defendant")}
      <div class="muted small">Ticked only by the association.</div></div>
    <div><div class="eyebrow">THE ASSOCIATION</div>
      <div>${esc(b.association.name.value) || "[Name]"}, certified since ${esc(b.association.certified_since.value) || "[date]"}</div>
      <div>Statutory purpose: ${esc(b.association.statutory_purpose_url.value) || "[link to the action]"}</div>
      <div>Counsel: ${esc(b.association.counsel.value) || "[law firm]"}</div>
      <div>Contact: ${esc(b.association.contact.value) || "[name, role, email]"}</div></div>
  </section>`;

  const summaryPage = summary
    ? `<section class="page-break doc"><h2 class="doc-h">Summary of the decision</h2>
      <p class="muted">${esc((b.header.source_decision.value as any)?.reference)}. Plain-language summary; each sentence is followed by the passage of the decision that supports it.</p>
      <ol class="summary">${summary.sentences.map((s) => `<li><p>${esc(s.text)}</p>${cite(s)}</li>`).join("")}</ol></section>`
    : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(b.header.action_name.value)} – funding brief</title><style>${CSS}</style></head>
  <body>${header}<main><div class="grid">${harm}${victims}${defendant}${value}</div>${timeline}${footer}</main>${summaryPage}</body></html>`;
}

export async function printPdf(html: string, outPdf: string) {
  const htmlPath = outPdf.replace(/\.pdf$/, ".html");
  await fs.mkdir(path.dirname(outPdf), { recursive: true });
  await fs.writeFile(htmlPath, html);
  await promisify(execFile)(CHROME, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${path.resolve(outPdf)}`, `file://${path.resolve(htmlPath)}`], { timeout: 60000 });
  return { htmlPath, pdfPath: outPdf };
}

const CSS = `
@page { size: A4; margin: 10mm; }
html { zoom: 0.9; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font: 9.5px/1.4 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1c2333; background: #fff; }
.mono, .eyebrow, .label, .scen th, .scen td, .step .mono { font-family: "SF Mono", Menlo, Consolas, monospace; }
.hero { background: #172238; color: #fff; padding: 14px 20px 10px; border-radius: 8px; }
.eyebrow { display: flex; justify-content: space-between; letter-spacing: .12em; font-size: 9px; color: #c9d1e3; text-transform: uppercase; margin-bottom: 6px; }
.hero h1 { font-size: 22px; margin: 2px 0 6px; }
.lede { font-size: 12px; max-width: 640px; margin: 0 0 10px; }
.gold { color: #f0c05a; font-weight: 700; }
.pills { display: flex; flex-wrap: wrap; gap: 6px; }
.pill { background: #2a3754; border-radius: 99px; padding: 4px 10px; font-size: 9.5px; }
.draft { margin-top: 10px; font-size: 9px; color: #f0c05a; font-style: italic; }
main { padding: 8px 0 0; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.card { background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #e3e6ec; break-inside: avoid; }
.card h2 { margin: 0; color: #fff; font-size: 13px; padding: 6px 12px; display: flex; justify-content: space-between; align-items: center; }
.card h2 .right { font-size: 9.5px; font-weight: 400; }
.card .body { padding: 6px 12px 8px; } .card p { margin: 5px 0; }
.c-harm h2 { background: #17614f; } .c-harm .label { color: #17614f; } .c-harm .chip { border-color: #17614f; color: #17614f; } .c-harm .chip.soft { background: #e3f1ec; border-color: transparent; }
.c-victims h2 { background: #2350a8; } .c-victims .label { color: #2350a8; } .c-victims .chip.soft { background: #e5ecf8; border-color: transparent; color: #2350a8; }
.c-defendant h2 { background: #6b2d7b; } .c-defendant .label { color: #6b2d7b; } .c-defendant .chip { background: #f1e6f4; color: #6b2d7b; border-color: transparent; } .c-defendant .chip.wide { flex: 1; text-align: center; }
.c-value h2 { background: #8a4b08; } .c-value .label { color: #8a4b08; }
.c-timeline h2 { background: #b23a2b; } .full { margin-top: 8px; }
.label { font-size: 8px; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; margin: 6px 0 3px; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.chip { border: 1px solid #ccd; border-radius: 99px; padding: 1px 8px; font-size: 9px; }
.chip.on { font-weight: 700; outline: 2px solid currentColor; }
.c-defendant .chip.on { background: #6b2d7b; color: #fff; outline: none; }
.chip.plain { border: none; padding: 2px 4px; }
.duo { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 6px 0; }
.box { background: #e5ecf8; border-radius: 6px; padding: 8px 10px; }
.c-value .box.dark { background: #8a4b08; color: #fff; } .c-value .box.dark .label { color: #f6dcb6; }
.c-value .box.light { background: #fbefdc; }
.big { font-size: 18px; font-weight: 800; }
.muted { color: #667085; font-size: 9px; font-style: italic; } .small { margin-top: 4px; }
.blank { color: #98a2b3; }
.cite { font-size: 7.5px; color: #475467; background: #f8f9fb; border-left: 2px solid #c8ccd6; padding: 3px 6px; margin-top: 6px; }
.ok { color: #12805c; font-weight: 700; font-style: normal; } .ok.warn { color: #b54708; } .bad { color: #c0262d; font-weight: 700; }
.tag { font-size: 7.5px; font-weight: 600; letter-spacing: 0; text-transform: none; border-radius: 4px; padding: 1px 5px; margin-left: 4px; vertical-align: middle; font-family: -apple-system, Arial, sans-serif; }
.t-decision { background: #dcfae6; color: #085d3a; } .t-assessment { background: #fef0c7; color: #93370d; } .t-computed { background: #e0eaff; color: #2d31a6; }
.t-assumption { background: #fbe8ff; color: #821890; } .t-association { background: #e0f2fe; color: #065986; } .t-missing { background: #f2f4f7; color: #667085; }
.scen { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 9.5px; }
.scen th { background: #fbefdc; text-align: left; padding: 3px 5px; } .scen td { padding: 3px 5px; border-bottom: 1px solid #f0e6d6; }
.steps { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.step .bar { height: 4px; background: #b23a2b; border-radius: 2px; margin-bottom: 5px; } .step b { color: #b23a2b; font-size: 10px; } .step .mono { font-size: 9px; color: #475467; }
.footer { background: #172238; color: #fff; border-radius: 8px; padding: 10px 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 8px; break-inside: avoid; }
.footer .eyebrow { color: #f0c05a; display: block; } .footer div { margin: 2px 0; } .footer .muted { color: #c9d1e3; }
.page-break { break-before: page; }
.doc { background: #fff; border-radius: 8px; padding: 18px 22px; }
.doc-h { font-size: 18px; margin: 0 0 6px; color: #172238; } .doc h3 { color: #172238; margin: 16px 0 6px; }
.summary li { margin-bottom: 12px; } .summary p { margin: 0 0 3px; font-size: 13px; } .summary .cite { font-size: 10px; }
.doc > .muted { font-size: 10.5px; }
`;
