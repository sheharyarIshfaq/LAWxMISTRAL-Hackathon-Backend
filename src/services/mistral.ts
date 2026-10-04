import fs from "node:fs/promises";
import path from "node:path";
import { Mistral } from "@mistralai/mistralai";
import type { Page } from "./storage.ts";

export const OCR_MODEL = "mistral-ocr-latest";
export const CHAT_MODEL = "mistral-medium-latest";

let client: Mistral | null = null;

export function mistral(): Mistral {
  if (!process.env.MISTRAL_API_KEY) throw new Error("MISTRAL_API_KEY is not set in .env");
  // Backoff makes the SDK retry 429 (rate limit) and 5xx responses instead of failing at once.
  client ??= new Mistral({
    apiKey: process.env.MISTRAL_API_KEY,
    retryConfig: {
      strategy: "backoff",
      backoff: { initialInterval: 2000, maxInterval: 20000, exponent: 1.5, maxElapsedTime: 90000 },
      retryConnectionErrors: true,
    },
  });
  return client;
}

// OCR a PDF from a public URL or a local file path. Returns one entry per PDF page.
export async function ocrPdf(source: string): Promise<Page[]> {
  let document;
  if (/^https?:\/\//.test(source)) {
    document = { type: "document_url" as const, documentUrl: source };
  } else {
    const uploaded = await mistral().files.upload({
      file: { fileName: path.basename(source), content: await fs.readFile(source) },
      purpose: "ocr",
    });
    document = { type: "file" as const, fileId: uploaded.id };
  }
  const res = await mistral().ocr.process({ model: OCR_MODEL, document });
  return res.pages.map((p) => ({ page: p.index + 1, text: p.markdown }));
}

export type Message = { role: "system" | "user" | "assistant"; content: string };

type CallOptions = { temperature: number; json?: boolean; timeoutMs?: number; maxRetryMs?: number };

async function complete(messages: Message[], opts: CallOptions): Promise<string> {
  const res = await mistral().chat.complete(
    {
      model: CHAT_MODEL,
      temperature: opts.temperature,
      messages,
      ...(opts.json ? { responseFormat: { type: "json_object" as const } } : {}),
    },
    {
      ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
      ...(opts.maxRetryMs
        ? { retries: { strategy: "backoff" as const, backoff: { initialInterval: 1000, maxInterval: 5000, exponent: 1.5, maxElapsedTime: opts.maxRetryMs }, retryConnectionErrors: true } }
        : {}),
    }
  );
  const content = res.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c: any) => c.text ?? "").join("");
  throw new Error("Empty response from Mistral");
}

// Multi-turn conversation (chatbot): system prompt + previous turns + new question.
// Live in the demo, so it must never hang: 45 s per attempt, retries on rate limits for 20 s at most.
export async function askChat(messages: Message[], temperature = 0.1): Promise<string> {
  return complete(messages, { temperature, timeoutMs: 45000, maxRetryMs: 20000 });
}

export async function askText(system: string, user: string, temperature = 0.2): Promise<string> {
  return complete([{ role: "system", content: system }, { role: "user", content: user }], { temperature });
}

// Strict JSON at temperature 0. If the reply doesn't parse, ask once more, showing the model its error.
export async function askJson<T = any>(system: string, user: string): Promise<T> {
  const messages: Message[] = [{ role: "system", content: system }, { role: "user", content: user }];
  const first = await complete(messages, { temperature: 0, json: true });
  try {
    return JSON.parse(first);
  } catch (err: any) {
    console.warn(`JSON parse failed (${err.message}), retrying once`);
    const second = await complete(
      [...messages, { role: "assistant", content: first }, { role: "user", content: `That was not valid JSON (${err.message}). Return only the corrected JSON object.` }],
      { temperature: 0, json: true }
    );
    return JSON.parse(second);
  }
}
