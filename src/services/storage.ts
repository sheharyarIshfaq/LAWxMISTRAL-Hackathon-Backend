import fs from "node:fs/promises";
import path from "node:path";

export const DATA_DIR = path.resolve("data");

export type Page = { page: number; text: string };

function caseFile(id: string, file: string) {
  // Case ids are folder names; reject anything that could escape data/.
  if (!/^[a-z0-9-]+$/.test(id)) throw new NotFound(`Invalid case id: ${id}`);
  return path.join(DATA_DIR, id, file);
}

export class NotFound extends Error {}

async function read(id: string, file: string): Promise<string> {
  try {
    return await fs.readFile(caseFile(id, file), "utf8");
  } catch (err: any) {
    if (err.code === "ENOENT") throw new NotFound(`${id}/${file} not found`);
    throw err;
  }
}

export async function readJson<T = any>(id: string, file: string): Promise<T> {
  return JSON.parse(await read(id, file));
}

export async function readJsonOr<T>(id: string, file: string, fallback: T): Promise<T> {
  try {
    return await readJson<T>(id, file);
  } catch (err) {
    if (err instanceof NotFound) return fallback;
    throw err;
  }
}

export async function readText(id: string, file: string): Promise<string> {
  return read(id, file);
}

export async function writeJson(id: string, file: string, data: unknown) {
  await fs.mkdir(path.join(DATA_DIR, id), { recursive: true });
  await fs.writeFile(caseFile(id, file), JSON.stringify(data, null, 2) + "\n");
}

export async function writeText(id: string, file: string, text: string) {
  await fs.mkdir(path.join(DATA_DIR, id), { recursive: true });
  await fs.writeFile(caseFile(id, file), text);
}

// A case is listed once its case.json exists.
export async function listCaseIds(): Promise<string[]> {
  const entries = await fs.readdir(DATA_DIR, { withFileTypes: true }).catch(() => []);
  const ids: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      await fs.access(path.join(DATA_DIR, e.name, "case.json"));
      ids.push(e.name);
    } catch {}
  }
  return ids;
}
