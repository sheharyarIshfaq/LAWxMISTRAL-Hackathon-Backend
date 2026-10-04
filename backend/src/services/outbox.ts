import { randomUUID } from "node:crypto";
import { readJsonOr, writeJson } from "./storage.ts";

// Emails are written to an outbox (data/outbox/emails.json) and shown in the app; nothing leaves the machine.
// A real SMTP transport can be plugged in here later.
export type Email = {
  id: string;
  kind: "radar_alert" | "brief_to_funder";
  to: string;
  to_name: string;
  subject: string;
  body: string; // Markdown
  related: Record<string, unknown>;
  sent_at: string;
};

export async function listEmails(filter: { kind?: string; to?: string } = {}): Promise<Email[]> {
  const all = await readJsonOr<Email[]>("outbox", "emails.json", []);
  return all.filter((e) => (!filter.kind || e.kind === filter.kind) && (!filter.to || e.to === filter.to)).sort((a, b) => b.sent_at.localeCompare(a.sent_at));
}

export async function sendEmail(email: Omit<Email, "id" | "sent_at">): Promise<Email> {
  const all = await readJsonOr<Email[]>("outbox", "emails.json", []);
  const saved = { ...email, id: randomUUID().slice(0, 8), sent_at: new Date().toISOString() };
  await writeJson("outbox", "emails.json", [...all, saved]);
  console.log(`  ✉ outbox: "${saved.subject}" → ${saved.to_name} <${saved.to}>`);
  return saved;
}
