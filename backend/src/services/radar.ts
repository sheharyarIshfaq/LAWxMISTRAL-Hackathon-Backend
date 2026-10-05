import { decisionInfo } from "./decisionKind.ts";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { listCaseIds, readJson, readJsonOr, writeJson, writeText, readText } from "./storage.ts";

export const CNIL_SANCTIONS_URL = "https://www.cnil.fr/fr/les-sanctions-prononcees-par-la-cnil";

export type RadarStatus = "candidate" | "candidate_public" | "filtered";

export type RadarItem = {
  id: string; // date + Légifrance id (or row hash when no link)
  date: string; // YYYY-MM-DD
  organisation_type: string; // as published by the CNIL (organisations are not named in the list)
  themes: string; // the CNIL's "Manquements principaux / Thèmes"
  decision: string; // the CNIL's "Décision adoptée"
  fine_eur: number | null;
  legifrance_url: string | null;
  data_breach: boolean;
  public_body: boolean;
  status: RadarStatus;
  priority: "high" | "medium" | "low" | null; // candidates only: fine ≥ €1M / ≥ €100k / below
  reasons: string[];
  case_id: string | null; // our processed case for this decision, if any
  authority?: string; // "CNIL" when absent; e.g. "European Commission" for a processed DMA decision
  first_seen_at: string;
  is_new: boolean; // appeared in the latest scan
};

export type RadarFeed = { source: string; scanned_at: string; from_cache: boolean; items: RadarItem[] };

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&eacute;/g, "é")
    .replace(/&egrave;/g, "è")
    .replace(/&agrave;/g, "à")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

// "Amende administrative de 27 millions d'euros", "de 1,5 million", "de 300 000 euros"
export function parseFine(text: string): number | null {
  const m = text.match(/amende[^0-9]*?([\d][\d\s.,]*)\s*(milliards?|millions?)?\s*d?['’]?\s*euros/i);
  if (!m) return null;
  const n = Number(m[1].replace(/\s/g, "").replace(/\.(?=\d{3})/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const unit = m[2]?.toLowerCase() ?? "";
  return Math.round(n * (unit.startsWith("milliard") ? 1e9 : unit.startsWith("million") ? 1e6 : 1));
}

// Triage rules on the CNIL's own wording: explainable, instant, no model.
const BREACH = /(défaut de )?sécurité des données|violation de données|notification (d'une|de la|des) violation/i;
const PUBLIC = /public|ministère|commune|mairie|collectivité|département|région|hôpital public|centre hospitalier|université|administration|état\b|préfecture|agence nationale/i;

export function triage(themes: string, organisationType: string, decision: string, published: boolean) {
  const reasons: string[] = [];
  const breach = BREACH.test(themes);
  const publicBody = PUBLIC.test(organisationType) && !/priv[ée]/i.test(organisationType);
  if (breach) reasons.push(`Data breach: the CNIL lists "${themes.match(BREACH)![0]}"`);
  else reasons.push(`Not a data breach: the CNIL lists "${themes}"`);
  if (breach && /communiquer une violation|personnes concernées/i.test(themes)) reasons.push("Victims not properly informed (art. 34) is among the breaches");
  if (publicBody) reasons.push(`Public body ("${organisationType}"): different route and court (administrative)`);
  const fine = parseFine(decision);
  if (breach && fine !== null) reasons.push(`Fine: €${fine.toLocaleString("en-US")}`);
  if (breach && !published) reasons.push("Decision not published on Légifrance (e.g. simplified procedure): no text to build a case from");
  const status: RadarStatus = !breach || !published ? "filtered" : publicBody ? "candidate_public" : "candidate";
  // Priority among candidates, by the size of the fine (a proxy for gravity and number of people).
  const priority = status === "filtered" ? null : fine !== null && fine >= 1_000_000 ? "high" : fine !== null && fine >= 100_000 ? "medium" : "low";
  return { data_breach: breach, public_body: publicBody, status, reasons, fine, priority };
}

export function parseSanctionsPage(html: string): Omit<RadarItem, "case_id" | "first_seen_at" | "is_new">[] {
  const items: Omit<RadarItem, "case_id" | "first_seen_at" | "is_new">[] = [];
  for (const table of html.match(/<table[^>]*>[\s\S]*?<\/table>/g) ?? []) {
    for (const row of table.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
      const cells = row.match(/<td[^>]*>[\s\S]*?<\/td>/g);
      if (!cells || cells.length < 4) continue;
      const [dateCell, orgCell, themeCell, decisionCell] = cells;
      const d = decode(dateCell).match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!d) continue;
      const date = `${d[3]}-${d[2]}-${d[1]}`;
      const organisation_type = decode(orgCell);
      const themes = decode(themeCell);
      const decision = decode(decisionCell).replace(/\s*Voir la délibération\s*/i, "").trim();
      const link = decisionCell.match(/href="(https?:\/\/www\.legifrance\.gouv\.fr\/[^"]+)"/)?.[1] ?? null;
      const t = triage(themes, organisation_type, decision, Boolean(link));
      items.push({
        // Unique per decision: the Légifrance id, else a hash of the whole row (unpublished decisions have no link).
        id: `${date}_${link?.match(/CNILTEXT\d+/)?.[0] ?? createHash("sha1").update(`${organisation_type}|${themes}|${decision}`).digest("hex").slice(0, 10)}`,
        date,
        organisation_type,
        themes,
        decision,
        fine_eur: t.fine,
        legifrance_url: link,
        data_breach: t.data_breach,
        public_body: t.public_body,
        status: t.status,
        priority: t.priority as RadarItem["priority"],
        reasons: t.reasons,
      });
    }
  }
  // Some rows share a decision (e.g. two companies in one Légifrance text): number the repeats.
  const count = new Map<string, number>();
  for (const it of items) {
    const n = (count.get(it.id) ?? 0) + 1;
    count.set(it.id, n);
    if (n > 1) it.id = `${it.id}-${n}`;
  }
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

// Our processed cases, keyed by decision date + fine, to link radar rows to briefs.
async function caseIndex(): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  for (const id of await listCaseIds()) {
    const c = await readJson(id, "case.json");
    if (c.mock) continue;
    const fine = (c.decision?.fines ?? []).map((f: any) => f.amount_eur).find((x: any) => typeof x === "number") ?? c.decision?.fine_total_eur;
    if (c.decision?.date && fine) index.set(`${c.decision.date}|${fine}`, id);
  }
  return index;
}

// A radar row built from a processed case (its own decision text), for decisions not yet on the CNIL list.
async function processedItem(caseId: string): Promise<Omit<RadarItem, "first_seen_at" | "is_new"> | null> {
  const c = await readJson(caseId, "case.json").catch(() => null);
  if (!c?.decision?.date) return null;
  const urls = JSON.parse(await fs.readFile(path.resolve("config/decisions.json"), "utf8").catch(() => "{}"));
  const info = await decisionInfo(caseId);
  // A decision from another authority (e.g. a European Commission DMA decision): not a CNIL data breach.
  if (info.kind !== "cnil") {
    const fine = c.decision.fine_total_eur ?? null;
    const articles = (c.violations ?? []).map((v: any) => `${v.law ?? ""} art. ${v.article ?? v.gdpr_article}`.trim()).join(", ");
    return {
      id: `${c.decision.date}_${caseId}`,
      date: c.decision.date,
      organisation_type: (c.defendant?.name ?? caseId).toUpperCase(),
      themes: `${(c.violations ?? []).map((v: any) => v.label).join(" · ")} (${articles})`,
      decision: `${c.decision.reference}${fine ? ` · fine of €${fine.toLocaleString("en-US")}` : ""}`,
      fine_eur: fine,
      legifrance_url: urls[caseId]?.url ?? null,
      data_breach: false,
      public_body: false,
      status: "candidate",
      priority: fine && fine >= 1_000_000 ? "high" : fine && fine >= 100_000 ? "medium" : "low",
      reasons: [`Breach found by the ${info.authority}: ${articles}`, ...(fine ? [`Fine: €${fine.toLocaleString("en-US")}`] : []), "Competition harm to the businesses disadvantaged: claim value to be estimated by an expert"],
      case_id: caseId,
      authority: info.authority,
    };
  }
  const fine = c.decision.fine_total_eur ?? null;
  const articles = (c.violations ?? []).map((v: any) => `art. ${v.gdpr_article}`).join(", ");
  const isPublic = c.defendant?.legal_form === "public";
  const themes = (c.violations ?? []).map((v: any) => v.label).join(" · ");
  const t = triage(`Défaut de sécurité des données ${themes}`, isPublic ? "ORGANISME PUBLIC" : "", `Amende administrative de ${fine ?? 0} euros`, true);
  return {
    id: `${c.decision.date}_${caseId}`,
    date: c.decision.date,
    organisation_type: (c.defendant?.name ?? caseId).toUpperCase(),
    themes: `${themes} (${articles}) · not yet on the CNIL list`,
    decision: `${c.decision.reference}${fine ? ` · amende de ${fine.toLocaleString("fr-FR")} euros` : ""}`,
    fine_eur: fine,
    legifrance_url: urls[caseId]?.url ?? null,
    data_breach: true,
    public_body: isPublic,
    status: isPublic ? "candidate_public" : "candidate",
    priority: t.priority as RadarItem["priority"],
    reasons: [`Data breach: the CNIL found breaches of ${articles}`, ...(isPublic ? ["Public body: different route and court (administrative)"] : []), ...(fine ? [`Fine: €${fine.toLocaleString("en-US")}`] : []), "Decision published on Légifrance; not yet on the CNIL's sanctions list"],
    case_id: caseId,
  };
}

// Save the Légifrance URL of each processed case (used for clickable § citations in the summary).
async function recordDecisionUrls(items: RadarItem[]) {
  const file = path.resolve("config/decisions.json");
  const config = JSON.parse(await fs.readFile(file, "utf8").catch(() => "{}"));
  let changed = false;
  for (const it of items)
    if (it.case_id && it.legifrance_url && config[it.case_id]?.url !== it.legifrance_url) {
      config[it.case_id] = { ...(config[it.case_id] ?? {}), url: it.legifrance_url };
      changed = true;
    }
  if (changed) await fs.writeFile(file, JSON.stringify(config, null, 2) + "\n");
}

// Fetch the CNIL list (falls back to the last saved copy), triage every decision, flag what is new since the last scan.
export async function scan(): Promise<RadarFeed & { new_count: number }> {
  let html: string;
  let fromCache = false;
  try {
    const res = await fetch(CNIL_SANCTIONS_URL, { headers: { "User-Agent": "Mozilla/5.0 (cnil-radar)" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`CNIL returned ${res.status}`);
    html = await res.text();
    await writeText("radar", "cnil-sanctions.html", html);
  } catch (err: any) {
    console.warn(`  CNIL site unreachable (${err.message}), using the last saved copy`);
    html = await readText("radar", "cnil-sanctions.html");
    fromCache = true;
  }
  const previous = await readJsonOr<RadarFeed | null>("radar", "feed.json", null);
  const seen = new Map((previous?.items ?? []).map((i) => [i.id, i.first_seen_at]));
  const now = new Date().toISOString();
  const cases = await caseIndex();
  const items: RadarItem[] = parseSanctionsPage(html).map((i) => ({
    ...i,
    case_id: cases.get(`${i.date}|${i.fine_eur}`) ?? null,
    first_seen_at: seen.get(i.id) ?? now,
    is_new: previous ? !seen.has(i.id) : false,
  }));
  // Decisions the platform already processed from Légifrance but the CNIL list does not show yet (it lags behind).
  const linked = new Set(items.map((i) => i.case_id).filter(Boolean));
  for (const [, caseId] of cases) {
    if (linked.has(caseId)) continue;
    const extra = await processedItem(caseId);
    if (extra) items.push({ ...extra, first_seen_at: seen.get(extra.id) ?? now, is_new: previous ? !seen.has(extra.id) : false });
  }
  items.sort((a, b) => b.date.localeCompare(a.date));
  await recordDecisionUrls(items);
  const feed: RadarFeed = { source: CNIL_SANCTIONS_URL, scanned_at: now, from_cache: fromCache, items };
  await writeJson("radar", "feed.json", feed);
  return { ...feed, new_count: items.filter((i) => i.is_new).length };
}

export async function getFeed(): Promise<RadarFeed | null> {
  return readJsonOr<RadarFeed | null>("radar", "feed.json", null);
}
