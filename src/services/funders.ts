import { randomUUID } from "node:crypto";
import { readJsonOr, writeJson } from "./storage.ts";

export const CASE_TYPES = ["data_protection", "consumer", "competition", "securities", "employment", "environment", "other"] as const;

export type Source = { url: string; title: string };

// A litigation funder. Unknown facts are null (never guessed). Discovered funders cite a source URL for every fact.
export type Funder = {
  id: string;
  name: string;
  origin: "platform" | "discovered";
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
