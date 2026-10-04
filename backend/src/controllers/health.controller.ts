import type { Request, Response } from "express";

export function getHealth(_req: Request, res: Response) {
  res.json({ ok: true, mistral_key_set: Boolean(process.env.MISTRAL_API_KEY) });
}
