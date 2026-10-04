import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { readJsonOr, writeJson } from "./storage.ts";

export const CASE_TYPES = ["data_protection", "consumer", "competition", "securities", "employment", "environment", "other"] as const;

export type Source = { url: string; title: string };

// A litigation funder. Unknown facts are null (never guessed). Discovered funders cite a source URL for every fact.
export type Funder = {
  id: string;
  name: string;
  origin: "curated" | "platform" | "discovered"; // curated = legal team's list (European Commission study)
  funder_type?: string | null; // as given in the legal team's list, e.g. "Financeur de contentieux"
  lookup_url?: string | null; // web search link from the list when there is no official site
  web_facts?: string[]; // curated funders: fields filled in from the web search (with sources), not from the list
  demo?: boolean; // fictional profile seeded for the demo
  website: string | null;
  description: string | null;
  jurisdictions: string[] | null; // ISO country codes, e.g. ["FR", "BE"]
  funds_collective_actions: boolean | null;
  case_types: string[] | null;
  min_claim_eur: number | null; // smallest claim value they consider
  max_investment_eur: number | null; // largest amount they invest in one case
  accepts_public_defendants: boolean | null;
  contact: string | null;
  sources: Source[]; // discovered funders: where each fact comes from
  fact_sources?: Record<string, string>; // field → source URL
  created_at: string;
};

const FILE = ["funders", "funders.json"] as const;

export async function listFunders(): Promise<Funder[]> {
  return readJsonOr<Funder[]>(FILE[0], FILE[1], []);
}

export async function saveFunders(funders: Funder[]) {
  await writeJson(FILE[0], FILE[1], funders);
}

export class InvalidFunder extends Error {}

const str = (v: unknown, field: string, required = false): string | null => {
  if (v === undefined || v === null || v === "") {
    if (required) throw new InvalidFunder(`${field} is required`);
    return null;
  }
  if (typeof v !== "string") throw new InvalidFunder(`${field} must be a string`);
  return v.trim();
};
const num = (v: unknown, field: string): number | null => {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new InvalidFunder(`${field} must be a positive number`);
  return v;
};
const bool = (v: unknown, field: string): boolean | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== "boolean") throw new InvalidFunder(`${field} must be true or false`);
  return v;
};
const list = (v: unknown, field: string, allowed?: readonly string[]): string[] | null => {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new InvalidFunder(`${field} must be a list of strings`);
  if (allowed) for (const x of v) if (!allowed.includes(x)) throw new InvalidFunder(`${field}: "${x}" is not one of ${allowed.join(", ")}`);
  return v;
};

// A funder registers on the platform (POST /funders).
export async function registerFunder(body: any): Promise<Funder> {
  const funder: Funder = {
    id: randomUUID().slice(0, 8),
    name: str(body?.name, "name", true)!,
    origin: "platform",
    website: str(body?.website, "website"),
    description: str(body?.description, "description"),
    jurisdictions: list(body?.jurisdictions, "jurisdictions")?.map((j) => j.toUpperCase()) ?? null,
    funds_collective_actions: bool(body?.funds_collective_actions, "funds_collective_actions"),
    case_types: list(body?.case_types, "case_types", CASE_TYPES),
    min_claim_eur: num(body?.min_claim_eur, "min_claim_eur"),
    max_investment_eur: num(body?.max_investment_eur, "max_investment_eur"),
    accepts_public_defendants: bool(body?.accepts_public_defendants, "accepts_public_defendants"),
    contact: str(body?.contact, "contact"),
    sources: [],
    created_at: new Date().toISOString(),
  };
  const all = await listFunders();
  await saveFunders([...all, funder]);
  return funder;
}

const key = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(litigation funding|litigation finance|capital partners|capital|partners|group|investment group|limited|ltd|llc|lp|sas|sa|bv|gmbh|srl|ag)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// The legal team's list (data/funders.csv, European Commission study). Blank cells are "unknown", never "no".
export async function readCuratedList(file = "data/funders.csv"): Promise<Funder[]> {
  const text = await fs.readFile(file, "utf8").catch(() => "");
  if (!text) return [];
  const [header, ...lines] = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  const cols = header.split(";");
  const col = (row: string[], name: string) => row[cols.findIndex((c) => c.startsWith(name))]?.trim() ?? "";
  const now = new Date().toISOString();
  return lines.map((line, i) => {
    const r = line.split(";");
    const official = col(r, "Type de lien") === "Site officiel";
    const link = col(r, "Lien") || null;
    return {
      id: `lt-${String(i + 1).padStart(3, "0")}`,
      name: col(r, "Nom"),
      origin: "curated" as const,
      funder_type: col(r, "Type") || null,
      website: official ? link : null,
      lookup_url: official ? null : link,
      description: null,
      jurisdictions: col(r, "Actif en France") === "Oui" ? ["FR"] : null,
      funds_collective_actions: col(r, "Actions collectives") === "Oui" ? true : null,
      case_types: null,
      min_claim_eur: null,
      max_investment_eur: null,
      accepts_public_defendants: null,
      contact: null,
      sources: [],
      created_at: now,
    };
  });
}

// funders.json = legal team's list + platform registrations + web-discovered funders (discovered.json).
// A discovered funder that is on the legal list is merged into it: the list's facts win, web facts fill the gaps.
export async function rebuildFunders() {
  const curated = await readCuratedList();
  const platform = (await listFunders()).filter((f) => f.origin === "platform");
  const discovered = await readJsonOr<Funder[]>("funders", "discovered.json", []);
  const byKey = new Map(curated.map((f) => [key(f.name), f]));
  const extra: Funder[] = [];
  let merged = 0;
  for (const d of discovered) {
    const k = key(d.name);
    const c = byKey.get(k) ?? [...byKey.entries()].find(([ck]) => ck && (ck.startsWith(k) || k.startsWith(ck)))?.[1];
    if (!c) {
      extra.push(d);
      continue;
    }
    merged++;
    const filled: string[] = [];
    for (const field of ["website", "description", "jurisdictions", "funds_collective_actions", "case_types", "min_claim_eur", "max_investment_eur", "accepts_public_defendants"] as const)
      if ((c[field] === null || c[field] === undefined) && d[field] !== null && d[field] !== undefined) {
        (c as any)[field] = d[field];
        filled.push(field);
      }
    c.web_facts = filled;
    c.sources = [...c.sources, ...d.sources];
  }
  await saveFunders([...curated, ...platform, ...extra]);
  return { curated: curated.length, platform: platform.length, discovered: discovered.length, merged, total: curated.length + platform.length + extra.length };
}
