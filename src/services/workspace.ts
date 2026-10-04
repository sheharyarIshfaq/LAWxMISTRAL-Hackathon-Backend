import { randomUUID } from "node:crypto";
import { getFeed } from "./radar.ts";
import { listFunders } from "./funders.ts";
import { loadBrief } from "./brief.ts";
import { sendEmail } from "./outbox.ts";
import { NotFound, readJsonOr, writeJson } from "./storage.ts";

// The association's workspace: the decisions it chose to work on, and the briefs it sent to funders.
export type WorkItem = {
  radar_id: string;
  case_id: string | null; // set when the platform has processed the decision (brief available)
  organisation_type: string;
  date: string;
  fine_eur: number | null;
  legifrance_url: string | null;
  status: "ready" | "analysis_requested";
  started_at: string;
};

export type Delivery = { id: string; case_id: string; funder_id: string; funder_name: string; message: string | null; sent_at: string };

export class WorkflowError extends Error {}

export const listWork = () => readJsonOr<WorkItem[]>("workspace", "cases.json", []);

// "Work on this case" from the Decisions tab.
export async function startWork(radarId: string): Promise<WorkItem> {
  const feed = await getFeed();
  const item = feed?.items.find((i) => i.id === radarId);
  if (!item) throw new NotFound(`No decision ${radarId} in the radar`);
  if (!item.case_id) throw new WorkflowError("This decision is not qualified for processing yet");
  const all = await listWork();
  const existing = all.find((w) => w.radar_id === radarId);
  if (existing) return existing;
  const work: WorkItem = {
    radar_id: item.id,
    case_id: item.case_id,
    organisation_type: item.organisation_type,
    date: item.date,
    fine_eur: item.fine_eur,
    legifrance_url: item.legifrance_url,
    status: item.case_id ? "ready" : "analysis_requested",
    started_at: new Date().toISOString(),
  };
  await writeJson("workspace", "cases.json", [work, ...all]);
  return work;
}

export const listDeliveries = async (filter: { case_id?: string; funder_id?: string } = {}) =>
  (await readJsonOr<Delivery[]>("workspace", "deliveries.json", []))
    .filter((d) => (!filter.case_id || d.case_id === filter.case_id) && (!filter.funder_id || d.funder_id === filter.funder_id))
    .sort((a, b) => b.sent_at.localeCompare(a.sent_at));

// Send the finalized brief to funders: one delivery per funder + an email in the outbox.
export async function sendBrief(caseId: string, funderIds: string[], message: string | null): Promise<Delivery[]> {
  const brief = await loadBrief(caseId);
  if (!brief) throw new NotFound(`${caseId} has no brief yet`);
  if (!brief.finalized_at) throw new WorkflowError("Finalize the brief before sending it to funders");
  if (!funderIds.length) throw new WorkflowError("Choose at least one funder");
  const funders = await listFunders();
  const all = await readJsonOr<Delivery[]>("workspace", "deliveries.json", []);
  const sent: Delivery[] = [];
  const assoc = (brief.association.name.value as string | null) ?? "An association";
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  for (const id of funderIds) {
    const f = funders.find((x) => x.id === id);
    if (!f) throw new WorkflowError(`Unknown funder ${id}`);
    if (all.some((d) => d.case_id === caseId && d.funder_id === id)) continue; // already sent
    const d: Delivery = { id: randomUUID().slice(0, 8), case_id: caseId, funder_id: id, funder_name: f.name, message, sent_at: new Date().toISOString() };
    sent.push(d);
    await sendEmail({
      kind: "brief_to_funder",
      to: f.contact ?? f.website ?? "(no public contact)",
      to_name: f.name,
      subject: `Funding brief: ${brief.header.action_name.value}`,
      body: `${assoc} is seeking funding for a collective action (action de groupe) based on ${(brief.header.source_decision.value as any)?.reference ?? "a CNIL decision"}.\n\n${message ? `${message}\n\n` : ""}Read the brief and question the decision: ${appUrl}/book`,
      related: { case_id: caseId, delivery_id: d.id },
    });
  }
  await writeJson("workspace", "deliveries.json", [...all, ...sent]);
  return sent;
}
