import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Brief, Field } from "./brief.ts";

import { marked } from "marked";

// Chrome (or Chromium / Edge) renders the PDF. CHROME_PATH wins; otherwise the usual install paths on macOS, Windows and Linux.
const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  `${process.env.LOCALAPPDATA ?? ""}\\Google\\Chrome\\Application\\chrome.exe`,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];
function chromePath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found) throw new Error("Chrome not found: install Google Chrome or set CHROME_PATH in .env to render the brief PDF");
  return found;
}

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

// The authority whose decision the brief is built from ("CNIL", "European Commission"), set per render.
let AUTHORITY = "CNIL";
const SOURCE_LABEL: Record<string, string> = {
  get decision() {
    return `${AUTHORITY} decision`;
  },
  assessment: "AI assessment",
  computed: "Computed",
  web: "Web source",
  assumption: "Assumption",
  association: "Association",
  missing: "To be provided",
};
const tag = (f?: Field) => (f && f.source !== "assessment" ? `<span class="tag t-${f.source}">${SOURCE_LABEL[f.source]}</span>` : "");
const check = (f: { quote_verified?: boolean; quote_fixed?: string }) =>
  f.quote_verified
    ? f.quote_fixed === "trimmed" || f.quote_fixed === "repaired"
      ? `<span class="ok warn">✓ verbatim · ${f.quote_fixed} by code, check support</span>`
      : `<span class="ok">✓ verbatim${f.quote_fixed === "page_corrected" ? " · page corrected" : ""}</span>`
    : `<span class="bad">✗ not found in decision</span>`;
const cite = (f?: { quote?: string | null; page?: number | null; quote_verified?: boolean; quote_fixed?: string }) =>
  f?.quote ? `<div class="cite">« ${esc(f.quote)} » <b>(p. ${f.page})</b> ${check(f)}</div>` : "";

// "(§ 3, § 21)" with each § linking to the passage on Légifrance; only verified quotes count.
function secLinks(...objs: any[]): string {
  const seen = new Map<string, string | null>();
  for (const o of objs.flat()) if (o?.paragraph && !seen.has(o.paragraph)) seen.set(o.paragraph, o.url ?? null);
  if (!seen.size) return "";
  return ` (${[...seen].map(([l, u]) => (u ? `<a href="${esc(u)}">${esc(l)}</a>` : esc(l))).join(", ")})`;
}

function card(title: string, icon: string, cls: string, body: string) {
  return `<section class="card ${cls}"><h2>${esc(title)}<span class="icon">${icon}</span></h2><div class="body">${body}</div></section>`;
}

export async function renderReportHtml(brief: Brief, summaryMarkdown: string | null, opts: { embed?: boolean } = {}) {
  const b = brief;
  const people = b.victims.number.value as number | null;
  const unit = b.victims.number.note;
  const scenarios = (b.value.scenarios.value as any[] | null) ?? [];
  const base = scenarios.find((s) => s.name === "base");
  const alts = ((b.value as any).category_alternatives?.value as any[] | null) ?? [];
  const expected = b.value.opt_in_expected.value as { expected_pct: number; std_dev_pts: number | null } | null;
  const legal = (b.header.legal_basis.value as any[] | null) ?? [];
  const funding = b.value.funding_sought_eur.value as number | null;
  const assoc = b.association.name.value as string | null;
  const facts = b.timeline.facts.value as { start?: string; end?: string } | null;
  const vi = (b.victims.identifiable as any).detail ?? null;
  const hq = (b.harm.quantified as any).detail ?? null;
  const revenue = b.defendant.revenue.value as { amount_eur: number; entity: string; year: number } | null;
  const current = (b.defendant as any).current_revenue?.value as { amount_eur: number; entity: string; year: number | null } | null;
  const solv = b.defendant.solvency.calc as { score: number; ratio: number; exposure_eur: number; net_income_eur: number; entity: string | null; year: number | null } | undefined;
  const today = new Date().toISOString().slice(0, 10);
  AUTHORITY = (b.header.source_decision.value as any)?.authority ?? "CNIL";
  const cnil = AUTHORITY === "CNIL";
  const subgroups = (b.victims.subgroups.value as string[] | null) ?? [];
  const lede = cnil
    ? `${assoc ? esc(assoc) : blank("Association")}, a certified consumer association, seeks
      <span class="gold">${funding ? eurM(funding) : "€[ to be set ]"}</span> to fund a French collective damages action (action de groupe)
      against ${esc(b.header.defendant.value)} on behalf of ${people ? num(people) : blank("number")} victims${people && unit && unit !== "persons" ? ` (counted as ${esc(unit)} by the CNIL)` : ""}.`
    : `${assoc ? esc(assoc) : blank("Association")} seeks
      <span class="gold">${funding ? eurM(funding) : "€[ to be set ]"}</span> to fund a collective damages action against ${esc(b.header.defendant.value)}
      on behalf of the businesses disadvantaged by the conduct the ${esc(AUTHORITY)} found (${people ? num(people) : blank("number to be established")}).`;

  const header = `
  <header class="hero">
    <div class="eyebrow"><span>FUNDING BRIEF · COLLECTIVE REDRESS ACTION</span><span>Confidential · ${day(today)}</span></div>
    <h1>${esc(b.header.action_name.value)}</h1>
    <p class="lede">${lede}</p>
    <div class="pills">
      <span class="pill">Source decision: ${esc((b.header.source_decision.value as any)?.authority)} ${esc((b.header.source_decision.value as any)?.reference)}</span>
      <span class="pill">Legal basis: ${legal.map((l) => esc(l.article)).join(", ") || "—"}</span>
      <span class="pill">Status: ${b.header.status.value ? esc(b.header.status.value) : "appeal status not stated in the decision"}</span>
    </div>
    <div class="draft">DRAFT FOR LEGAL REVIEW · generated from the ${esc(AUTHORITY)} decision · every quote is checked word for word against the decision · values in [brackets] are to be provided</div>
  </header>`;

  // Legal team's five scores (0-100), computed in code; "—" with the reason when an input is missing.
  const SCORE_LABELS: [string, string][] = [["value", "Value of the claim"], ["victims", "Victims"], ["defendant", "Defendant"], ["harm", "Type of harm"], ["timeline", "Timeline"]];
  const scoreTiles = (b as any).scores
    ? `<section class="scores">${SCORE_LABELS.map(([k, label]) => {
        const sc = (b as any).scores[k];
        const v = sc?.score;
        const tone = v == null ? "s-none" : v >= 70 ? "s-good" : v >= 40 ? "s-mid" : "s-low";
        const why = v == null ? sc?.reason ?? "" : sc.explanation;
        return `<div class="score ${tone}" title="${esc(why)}"><div class="s-top"><span class="s-label">${esc(label)}</span><span class="s-val">${v == null ? "—" : v}${sc?.label ? ` <small>${esc(sc.label)}</small>` : ""}</span></div><div class="s-bar"><div style="width:${v ?? 0}%"></div></div><div class="s-why">${esc(why)}</div></div>`;
      }).join("")}</section>`
    : "";

  const harm = card("Type of harm", "🛡", "c-harm", `
    <div class="label">Is the harm quantified? ${tag(b.harm.quantified)}</div>
    ${chips([["quantified", "Quantified"], ["quantifiable", "Quantifiable"], ["to_be_proven", "To be proven"]], b.harm.quantified.value as string)}
    ${hq ? `<div class="why">${esc(hq.justification)}${secLinks(hq.quotes)}${(hq.subgroups ?? []).map((g: any) => `<br>• ${esc(g.group)}: <b>${esc(String(g.level).replace(/_/g, " "))}</b>, ${esc(g.justification)}${secLinks(g)}`).join("")}</div>` : ""}
    <div class="label">Nature ${tag(b.harm.nature)}</div>
    ${chips([["financial", "Financial"], ["non_material", "Non-material"], ["overcharge", "Overcharge"], ["loss_of_chance", "Loss of chance"]], b.harm.nature.value as string[], "soft")}
    <p>${esc(b.harm.description.value) || blank("Description of the harm")}</p>
    ${hq ? "" : cite(b.harm.description)}`);

  const victims = card("Victims", "👥", "c-victims", `
    <div class="duo">
      <div class="box"><div class="label">Number ${tag(b.victims.number)}</div><div class="big">${people ? num(people) : "[ ]"}</div><div class="muted">${esc(unit ?? "")}</div></div>
      <div class="box"><div class="label">Identifiable? ${tag(b.victims.identifiable)}</div>${chips([["yes", "Yes"], ["partly", "Partly"], ["no", "No"]], b.victims.identifiable.value as string, "plain")}</div>
    </div>
    ${cite(b.victims.number)}
    <div class="label">Category ${tag(b.victims.categories)}</div>
    ${chips([["consumers", "Consumers"], ["businesses", "Businesses"], ["retail_investors", "Retail investors"], ["employees", "Employees"], ["other", "Other"]], b.victims.categories.value as string[], "soft")}
    <p><b>Proof of class membership:</b> ${esc(b.victims.proof_of_membership.value) || blank("document")} ${tag(b.victims.proof_of_membership)}</p>
    ${!vi && (b.victims.subgroups.value as string[] | null)?.length ? `<p class="muted">Subgroups: ${(b.victims.subgroups.value as string[]).map(esc).join("; ")}</p>` : ""}
    ${vi ? `<div class="why"><b>${esc(String(vi.level)[0].toUpperCase() + String(vi.level).slice(1))}:</b> ${esc(vi.statement)}${secLinks(vi.list_holder, vi.proof)}${(vi.subgroups ?? []).map((g: any) => `<br>• ${esc(g.group)}: <b>${esc(g.level)}</b>, ${esc(g.evidence)}${secLinks(g)}`).join("")}${vi.weakening?.length ? `<div class="weak">⚠ ${vi.weakening.map((w: any) => `${esc(w.explanation || w.wording)}${secLinks(w.sources)}`).join(" · ")}</div>` : ""}</div>` : cite(b.victims.identifiable)}`);

  const defendant = card("Defendant", "🏛", "c-defendant", `
    <div class="label">Nature ${tag(b.defendant.nature)}</div>
    ${chips([["private_company", "Private company"], ["listed_group", "Listed group"], ["public_body", "Public body"], ["association_or_union", "Association or union"]], b.defendant.nature.value as string[], "soft")}
    <div class="label">Solvency ${tag(b.defendant.solvency)}</div>
    ${chips([["low", "Low"], ["medium", "Medium"], ["strong", "Strong"]], b.defendant.solvency.value as string, "wide")}
    ${solv ? `<div class="solv"><b>${solv.ratio.toFixed(1)}%</b> = damages ${eurM(solv.exposure_eur)} ÷ net income ${eurM(solv.net_income_eur)}${solv.entity ? ` (${esc(solv.entity)}${solv.year ? `, ${solv.year}` : ""})` : ""} · score ${solv.score}/100<div class="muted">0–39 Low · 40–69 Medium · 70–100 Strong (damages = base scenario)</div></div>` : `<p class="muted">${esc(b.defendant.solvency.note ?? "")}</p>`}
    <p><b>Indicators:</b> revenue ${current ? `${eurM(current.amount_eur)} (${esc(current.entity)}${current.year ? `, ${current.year}` : ""}${b.defendant.current_revenue.source_url ? `, <a href="${esc(b.defendant.current_revenue.source_url)}">source</a>` : ""})` : blank()}${revenue && (!current || revenue.entity !== current.entity) ? `; group ${esc(revenue.entity)} ${eurM(revenue.amount_eur)} (${revenue.year}, decision)` : `, group ${esc(b.defendant.group.value) || blank()}`},
      insurance ${blank()}, competent court ${esc(b.defendant.competent_court.value) || blank("civil / administrative")} ${tag(b.defendant.competent_court)}</p>
    ${cite(b.defendant.revenue)}`);

  const value = !cnil
    ? card("Value of the claim", "€", "c-value", `
    <p>${esc(b.value.formula)} ${tag(b.value.scenarios)}</p>
    <p>${esc(b.value.scenarios.note ?? "")}.</p>
    <div class="label">Period</div>
    <p>${facts ? monthSpan(facts.start, facts.end) : blank()}${facts && !facts.end ? " (ongoing at the date of the decision)" : ""}</p>
    ${subgroups.length ? `<div class="label">Businesses disadvantaged (decision)</div><p>${subgroups.map(esc).join("; ")}</p>` : ""}
    <div class="duo">
      <div class="box dark"><div class="label">Claim value</div><div class="big">€[ expert ]</div><div class="sub">lost profits, to be estimated</div></div>
      <div class="box light"><div class="label">Funder's share</div><div class="big">${b.value.funder_share.value != null ? pct(b.value.funder_share.value as number) : "[ ] %"}</div><div class="sub">of the amount recovered</div></div>
    </div>
    <p class="muted">The legal team's opt-in table covers CNIL data-breach cases only; it is not applied here. ${esc(b.value.benchmarks_note.value)}</p>`)
    : card("Value of the claim", "€", "c-value", `
    <p>${esc(b.value.formula)} ${tag(b.value.scenarios)}</p>
    <div class="label">Category of harm (opt-in table)</div>
    <p class="cat">${b.value.harm_category.value ? esc(b.value.harm_category.value) : blank("not classified")} ${b.value.harm_category.source === "association" ? tag(b.value.harm_category) : ""}</p>
    ${cite(b.value.harm_category)}
    <table class="scen"><thead><tr><th>Scenario</th><th>Opt-ins</th><th>€ / victim</th><th>Total</th></tr></thead><tbody>
      ${scenarios.map((s) => `<tr><td>${s.name[0].toUpperCase() + s.name.slice(1)} <span class="muted">(${pct(s.opt_in_rate)})</span></td><td>${num(s.opt_ins)}</td><td>€${num(s.compensation_per_victim_eur)}</td><td><b>${eurM(s.total_eur)}</b></td></tr>`).join("") || `<tr><td colspan="4">${blank("cannot be computed")}</td></tr>`}
    </tbody></table>
    ${alts.filter((x) => x.totals).length ? `<div class="alts"><b>Also supported by the decision:</b> ${alts.filter((x) => x.totals).map((x) => `${esc(x.category)} → ${eurM(x.totals.low)} / <b>${eurM(x.totals.base)}</b> / ${eurM(x.totals.high)}`).join("; ")}. <span class="muted">The most conservative data-breach row is used.</span></div>` : ""}
    <div class="duo">
      <div class="box dark"><div class="label">Expected opt-in</div><div class="big">${expected ? `${expected.expected_pct}%` : "[ ] %"}</div><div class="sub">${expected?.std_dev_pts != null ? `± ${expected.std_dev_pts} pts · past cases in this category` : "past cases in this category"}</div></div>
      <div class="box light"><div class="label">Funder's share</div><div class="big">${b.value.funder_share.value != null ? pct(b.value.funder_share.value as number) : "[ ] %"}</div><div class="sub">${base ? `${eurM(base.funder_eur)} at base scenario` : ""}</div></div>
    </div>
    <p class="muted">Opt-in rates from the legal team's table of past cases; €${num(b.value.compensation_per_victim_eur.value as number)} per victim${b.victims.number.note && b.victims.number.note !== "persons" ? `; each of the ${esc(b.victims.number.note)} counted by the CNIL is treated as one person` : ""}. ${esc(b.value.benchmarks_note.value)}</p>`);

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

  const summaryPage = summaryMarkdown
    ? `<section class="page-break doc md"><h2 class="doc-h">Summary of the decision</h2>
      <p class="muted">${esc((b.header.source_decision.value as any)?.reference)}. Every fact cites the paragraph (§) of the decision; each citation was checked against the decision text by code (⚠ = could not be verified).</p>
      ${marked.parse(summaryMarkdown, { async: false }) as string}</section>`
    : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(b.header.action_name.value)} – funding brief</title>${opts.embed ? '<base target="_blank"><style>html { zoom: 1 } body { background: #fff; padding: 12px; }</style>' : ""}<style>${CSS}</style></head>
  <body>${header}<main>${scoreTiles}<div class="grid">${harm}${victims}${defendant}${value}</div>${timeline}${footer}</main>${summaryPage}</body></html>`;
}

export async function printPdf(html: string, outPdf: string) {
  const htmlPath = outPdf.replace(/\.pdf$/, ".html");
  await fs.mkdir(path.dirname(outPdf), { recursive: true });
  await fs.writeFile(htmlPath, html);
  await promisify(execFile)(chromePath(), ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", `--print-to-pdf=${path.resolve(outPdf)}`, pathToFileURL(path.resolve(htmlPath)).href], { timeout: 60000 });
  return { htmlPath, pdfPath: outPdf };
}

const CSS = `
@page { size: A4; margin: 10mm; }
html { zoom: 0.85; }
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
.c-value h2 { background: #8a4b08; } .c-value .label { color: #8a4b08; } .c-value .cat { font-weight: 700; margin: 2px 0; }
.c-timeline h2 { background: #b23a2b; } .full { margin-top: 8px; }
.label { font-size: 8px; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; margin: 6px 0 3px; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.chip { border: 1px solid #ccd; border-radius: 99px; padding: 1px 8px; font-size: 9px; }
.chip.on { font-weight: 700; outline: 2px solid currentColor; }
.c-defendant .chip.on { background: #6b2d7b; color: #fff; outline: none; }
.c-defendant .solv { background: #f1e6f4; border-radius: 6px; padding: 5px 8px; margin: 6px 0; color: #4a1f55; } .c-defendant .solv b { font-size: 13px; } .c-defendant a { color: #6b2d7b; }
.chip.plain { border: none; padding: 2px 4px; }
.duo { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 6px 0; }
.box { background: #e5ecf8; border-radius: 6px; padding: 8px 10px; }
.c-value .box.dark { background: #8a4b08; color: #fff; } .c-value .box.dark .label { color: #f6dcb6; }
.c-value .alts { font-size: 8.5px; background: #fbefdc; border-radius: 5px; padding: 4px 7px; margin: 2px 0 6px; color: #5b3206; } .c-value .alts .muted { font-size: 8px; }
.c-value .box .sub { font-size: 8.5px; margin-top: 1px; opacity: .85; } .c-value .box.light .sub { color: #8a4b08; }
.c-value .box.light { background: #fbefdc; }
.big { font-size: 18px; font-weight: 800; }
.muted { color: #667085; font-size: 9px; font-style: italic; } .small { margin-top: 4px; }
.blank { color: #98a2b3; }
.why { font-size: 8.5px; background: #f8f9fb; border-radius: 5px; padding: 4px 7px; margin: 5px 0; color: #344054; } .why a { color: #2350a8; font-weight: 600; text-decoration: none; }
.why .weak { color: #b54708; margin-top: 3px; }
.cite { font-size: 7.5px; color: #475467; background: #f8f9fb; border-left: 2px solid #c8ccd6; padding: 3px 6px; margin-top: 6px; }
.ok { color: #12805c; font-weight: 700; font-style: normal; } .ok.warn { color: #b54708; } .bad { color: #c0262d; font-weight: 700; }
.tag { font-size: 7.5px; font-weight: 600; letter-spacing: 0; text-transform: none; border-radius: 4px; padding: 1px 5px; margin-left: 4px; vertical-align: middle; font-family: -apple-system, Arial, sans-serif; }
.t-decision { background: #dcfae6; color: #085d3a; } .t-assessment { background: #fef0c7; color: #93370d; } .t-computed { background: #e0eaff; color: #2d31a6; }
.t-assumption { background: #fbe8ff; color: #821890; } .t-web { background: #e0f2fe; color: #065986; } .t-association { background: #e0f2fe; color: #065986; } .t-missing { background: #f2f4f7; color: #667085; }
.scen { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 9.5px; }
.scen th { background: #fbefdc; text-align: left; padding: 3px 5px; } .scen td { padding: 3px 5px; border-bottom: 1px solid #f0e6d6; }
.steps { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
.step .bar { height: 4px; background: #b23a2b; border-radius: 2px; margin-bottom: 5px; } .step b { color: #b23a2b; font-size: 10px; } .step .mono { font-size: 9px; color: #475467; }
.footer { background: #172238; color: #fff; border-radius: 8px; padding: 10px 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 8px; break-inside: avoid; }
.footer .eyebrow { color: #f0c05a; display: block; } .footer div { margin: 2px 0; } .footer .muted { color: #c9d1e3; }
.page-break { break-before: page; }
.scores { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin-bottom: 8px; }
.score { background: #fff; border: 1px solid #e3e6ec; border-radius: 8px; padding: 6px 8px; }
.s-top { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; }
.s-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #475467; }
.s-val { font-size: 16px; font-weight: 800; color: #172238; } .s-val small { font-size: 8px; font-weight: 600; }
.s-bar { height: 4px; background: #eef0f4; border-radius: 2px; margin: 3px 0; } .s-bar div { height: 4px; border-radius: 2px; }
.s-good .s-bar div { background: #12b76a; } .s-mid .s-bar div { background: #f79009; } .s-low .s-bar div { background: #f04438; } .s-none .s-val { color: #98a2b3; }
.s-why { font-size: 7px; line-height: 1.3; color: #667085; }
.md { font-size: 11px; line-height: 1.5; } .md h1, .md h2:not(.doc-h) { font-size: 14px; color: #172238; margin: 14px 0 4px; border-bottom: 1px solid #eaecf0; padding-bottom: 2px; }
.md h3, .md h4 { font-size: 12px; color: #172238; margin: 10px 0 2px; } .md p { margin: 0 0 7px; } .md a { color: #2350a8; text-decoration: none; font-weight: 600; }
.doc { background: #fff; border-radius: 8px; padding: 18px 22px; }
.doc-h { font-size: 18px; margin: 0 0 6px; color: #172238; } .doc h3 { color: #172238; margin: 16px 0 6px; }
.summary li { margin-bottom: 12px; } .summary p { margin: 0 0 3px; font-size: 13px; } .summary .cite { font-size: 10px; }
.doc > .muted { font-size: 10.5px; }
`;
