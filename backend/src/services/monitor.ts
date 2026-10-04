import fs from "node:fs/promises";
import path from "node:path";
import { scan, type RadarItem } from "./radar.ts";
import { sendEmail } from "./outbox.ts";
import { readJsonOr, writeJson } from "./storage.ts";

// Background monitoring: scans the CNIL sanctions list on a schedule and emails the associations
// about new decisions worth a collective action. Associations never trigger it themselves.
const HOURS = Number(process.env.MONITOR_INTERVAL_HOURS ?? 6);
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export type MonitorState = {
  interval_hours: number;
  last_run: string | null;
  next_run: string | null;
  last_result: { total: number; new: number; new_candidates: number; emails: number; from_cache: boolean } | null;
  error: string | null;
};

type Association = { name: string; email: string };

async function associations(): Promise<Association[]> {
  try {
    return JSON.parse(await fs.readFile(path.resolve("config/associations.json"), "utf8"));
  } catch {
    return [];
  }
}

const eur = (n: number | null) => (n == null ? "no fine" : n >= 1e6 ? `€${(n / 1e6).toFixed(1)}M` : `€${n.toLocaleString("en-US")}`);

function alertEmail(items: RadarItem[]) {
  const lines = items.map(
    (i) =>
      `- **${i.organisation_type}** · CNIL ${i.date} · fine ${eur(i.fine_eur)}${i.priority ? ` · ${i.priority} priority` : ""}\n  ${i.reasons.join("; ")}${i.legifrance_url ? `\n  Decision: ${i.legifrance_url}` : ""}`
  );
  return {
    subject: `${items.length} new CNIL decision${items.length > 1 ? "s" : ""} with collective-action potential`,
    body: `The CNIL published new sanctions that may open a collective action (action de groupe):\n\n${lines.join("\n\n")}\n\nReview them and start a case: ${APP_URL}/desk`,
  };
}

export async function getMonitorState(): Promise<MonitorState> {
  return readJsonOr<MonitorState>("radar", "monitor.json", { interval_hours: HOURS, last_run: null, next_run: null, last_result: null, error: null });
}

export async function runMonitor(): Promise<MonitorState> {
  const state = await getMonitorState();
  const now = new Date();
  try {
    const feed = await scan();
    const fresh = feed.items.filter((i) => i.is_new && i.status !== "filtered");
    let emails = 0;
    if (fresh.length) {
      const { subject, body } = alertEmail(fresh);
      for (const a of await associations()) {
        await sendEmail({ kind: "radar_alert", to: a.email, to_name: a.name, subject, body, related: { radar_ids: fresh.map((i) => i.id) } });
        emails++;
      }
    }
    Object.assign(state, {
      interval_hours: HOURS,
      last_run: now.toISOString(),
      next_run: new Date(now.getTime() + HOURS * 3600_000).toISOString(),
      last_result: { total: feed.items.length, new: feed.new_count, new_candidates: fresh.length, emails, from_cache: feed.from_cache },
      error: null,
    });
    console.log(`  radar: ${feed.items.length} sanctions, ${feed.new_count} new, ${fresh.length} candidates, ${emails} email(s)`);
  } catch (err: any) {
    Object.assign(state, { last_run: now.toISOString(), next_run: new Date(now.getTime() + HOURS * 3600_000).toISOString(), error: err.message });
    console.error(`  radar monitoring failed: ${err.message}`);
  }
  await writeJson("radar", "monitor.json", state);
  return state;
}

// Runs shortly after start-up, then every MONITOR_INTERVAL_HOURS (default 6).
export function startMonitor() {
  setTimeout(() => void runMonitor(), 5000);
  setInterval(() => void runMonitor(), HOURS * 3600_000);
  console.log(`Radar monitoring: every ${HOURS} h`);
}
