import fs from "node:fs/promises";
import path from "node:path";

// Which kind of decision a case comes from. CNIL data-breach sanctions use the legal team's prompts in prompts/;
// other kinds (e.g. European Commission DMA decisions) use their own versions in prompts/<kind>/ where one exists.
export type DecisionKind = "cnil" | "eu-dma";
export type DecisionInfo = { kind: DecisionKind; authority: string; language: "fr" | "en"; reference: string | null; url: string | null };

export async function decisionInfo(id: string): Promise<DecisionInfo> {
  let entry: any = {};
  try {
    entry = JSON.parse(await fs.readFile(path.resolve("config/decisions.json"), "utf8"))[id] ?? {};
  } catch {}
  return {
    kind: entry.kind ?? "cnil",
    authority: entry.authority ?? "CNIL",
    language: entry.language ?? "fr",
    reference: entry.reference ?? null,
    url: entry.url ?? null,
  };
}

// prompts/<kind>/<name> for non-CNIL decisions when that file exists, else the legal team's prompts/<name>.
export async function promptFor(id: string, name: string): Promise<string> {
  const { kind } = await decisionInfo(id);
  if (kind !== "cnil") {
    const own = path.resolve("prompts", kind, name);
    try {
      return await fs.readFile(own, "utf8");
    } catch {}
  }
  return fs.readFile(path.resolve("prompts", name), "utf8");
}

// How quotes must be written: in the language of the decision.
export const quoteLanguage = (info: DecisionInfo) => (info.language === "en" ? "English" : "French");
