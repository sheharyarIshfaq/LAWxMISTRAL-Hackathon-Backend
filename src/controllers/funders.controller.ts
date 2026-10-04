import type { Request, Response } from "express";
import { InvalidFunder, listFunders, registerFunder } from "../services/funders.ts";
import { runDiscovery } from "../services/discover.ts";

export async function getFunders(_req: Request, res: Response) {
  res.json(await listFunders());
}

// A funder registers on the platform.
export async function createFunder(req: Request, res: Response) {
  try {
    res.status(201).json(await registerFunder(req.body));
  } catch (err) {
    if (err instanceof InvalidFunder) return res.status(400).json({ error: err.message });
    throw err;
  }
}

// AI agent with web search finds real funders (~20-40 s). Every fact keeps its source URL.
export async function discover(_req: Request, res: Response) {
  const found = await runDiscovery();
  res.json({ discovered: found.length, funders: await listFunders() });
}
