import type { Request, Response, NextFunction } from "express";
import { NotFound } from "../services/storage.ts";

// Turns any error into a clear JSON message. Express 5 forwards rejected async handlers here, so no route can crash the server.
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof NotFound) return res.status(404).json({ error: err.message });
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Request body is not valid JSON" });

  // Mistral SDK errors
  const status = err?.statusCode ?? err?.rawResponse?.status;
  const name = err?.name ?? "";
  if (status === 429) return res.status(503).json({ error: "The AI service is busy (rate limit). Please try again in a few seconds.", code: "ai_rate_limited" });
  if (status === 401 || status === 403) return res.status(502).json({ error: "The AI service rejected the API key. Check MISTRAL_API_KEY in .env.", code: "ai_auth" });
  if (typeof status === "number" && status >= 500) return res.status(502).json({ error: "The AI service had an error. Please try again.", code: "ai_unavailable" });
  if (/Timeout|Aborted/i.test(name)) return res.status(504).json({ error: "The AI service took too long to answer. Please try again.", code: "ai_timeout" });
  if (/ConnectionError/i.test(name)) return res.status(502).json({ error: "Could not reach the AI service. Check the internet connection.", code: "ai_unreachable" });
  if (err instanceof SyntaxError) return res.status(502).json({ error: "The AI returned an unreadable answer. Please try again.", code: "ai_bad_output" });

  console.error(`${req.method} ${req.originalUrl} failed:`, err);
  res.status(500).json({ error: err?.message ?? "Internal error", code: "internal" });
}

export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: `No route ${req.method} ${req.path}` });
}
