import type { Request, Response } from "express";
import { getFeed, scan } from "../services/radar.ts";

// Query: ?status=candidate|candidate_public|filtered  &priority=high|medium|low  &since=YYYY-MM-DD  &breach=true
export async function getRadar(req: Request, res: Response) {
  const feed = await getFeed();
  if (!feed) return res.status(404).json({ error: "No scan yet: POST /radar/scan" });
  const { status, since, breach, priority } = req.query;
  let items = feed.items;
  if (typeof status === "string") items = items.filter((i) => i.status === status);
  if (typeof since === "string") items = items.filter((i) => i.date >= since);
  if (breach === "true") items = items.filter((i) => i.data_breach);
  if (typeof priority === "string") items = items.filter((i) => i.priority === priority);
  const all = feed.items;
  res.json({
    source: feed.source,
    scanned_at: feed.scanned_at,
    from_cache: feed.from_cache,
    stats: {
      total: all.length,
      data_breaches: all.filter((i) => i.data_breach).length,
      candidates: all.filter((i) => i.status === "candidate").length,
      candidates_public: all.filter((i) => i.status === "candidate_public").length,
      filtered: all.filter((i) => i.status === "filtered").length,
      high_priority: all.filter((i) => i.priority === "high").length,
      new: all.filter((i) => i.is_new).length,
    },
    items,
  });
}

// Fetches the CNIL sanctions list and triages every decision (~2 s, no model call).
export async function postScan(_req: Request, res: Response) {
  const feed = await scan();
  res.json({ scanned_at: feed.scanned_at, from_cache: feed.from_cache, total: feed.items.length, new: feed.new_count, new_items: feed.items.filter((i) => i.is_new) });
}
