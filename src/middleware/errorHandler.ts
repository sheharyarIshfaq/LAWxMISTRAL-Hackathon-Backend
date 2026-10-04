import type { Request, Response, NextFunction } from "express";
import { NotFound } from "../services/storage.ts";

// Express 5 forwards rejected async handlers here, so no route can crash the server.
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof NotFound) return res.status(404).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: err?.message ?? "Internal error" });
}
