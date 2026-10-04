// Client for the Express backend (see API.md in the backend repo).
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  } catch {
    throw new ApiError(`Cannot reach the backend at ${API_URL}. Is it running (npm run dev)?`, 0, "unreachable");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status, body?.code);
  return body as T;
}

// ---- Cases ----
export type CaseListItem = {
  id: string;
  defendant: string | null;
  date: string | null;
  fine_total_eur: number | null;
  people_affected: number | null;
  data_types: string[];
  mock: boolean;
  ready: boolean;
};

export type CaseJson = {
  case_id: string;
  decision: { regulator: string; reference: string; date: string; fine_total_eur: number; fines: { entity: string; amount_eur: number }[]; under_appeal: boolean | null };
  defendant: { name: string; legal_form: string; sector: string };
  breach: { summary: string; people_affected: number; people_affected_unit: string; data_types: string[] };
  violations: { gdpr_article: string; label: string }[];
};

export type Field<T = unknown> = { value: T | null; source: string; quote?: string | null; page?: number | null; quote_verified?: boolean; note?: string; detail?: unknown; calc?: unknown };

export type Scenario = { name: "low" | "base" | "high"; opt_in_rate: number; opt_ins: number; compensation_per_victim_eur: number; total_eur: number; funder_eur: number; victims_eur: number };

export type Brief = {
  case_id: string;
  finalized_at: string | null;
  header: { action_name: Field<string>; defendant: Field<string> };
  victims: { number: Field<number> };
  value: { scenarios: Field<Scenario[]>; harm_category: Field<string>; funder_share: Field<number>; opt_in_expected: Field<{ expected_pct: number; std_dev_pts: number | null }> };
  defendant: { solvency: Field<string>; current_revenue: Field<{ amount_eur: number; entity: string; year: number | null }> };
  [section: string]: unknown;
};

export type Citation = { id: number; label: string; quote: string | null; fragment: string | null; verified: boolean; note: string | null; url: string | null };

export const listCases = () => call<CaseListItem[]>("/cases");
export const getCase = (id: string) => call<CaseJson>(`/cases/${id}`);
export const getPitch = (id: string) => call<{ brief: Brief; markdown: string }>(`/cases/${id}/pitch`);
export const getSummary = (id: string) => call<{ markdown: string; citations: Citation[]; decision_url: string | null }>(`/cases/${id}/summary`);
export const editBrief = (id: string, edits: Record<string, unknown>) => call<{ brief: Brief }>(`/cases/${id}/brief`, { method: "PATCH", body: JSON.stringify({ edits }) });
export const briefHtmlUrl = (id: string) => `${API_URL}/cases/${id}/brief.html`;
export const briefPdfUrl = (id: string) => `${API_URL}/cases/${id}/brief.pdf`;

// ---- Chat ----
export type ChatTurn = { role: "user" | "assistant"; content: string };
export type ChatCitation = { quote: string; page: number; paragraph: string | null; verified: boolean };
export const chat = (id: string, question: string, history: ChatTurn[]) =>
  call<{ answer: string; citations: ChatCitation[] }>(`/cases/${id}/chat`, { method: "POST", body: JSON.stringify({ question, history }) });

// ---- Funders & matching ----
export type Funder = {
  id: string;
  name: string;
  origin: "curated" | "platform" | "discovered";
  demo?: boolean;
  funder_type?: string | null;
  website: string | null;
  lookup_url?: string | null;
  description: string | null;
  jurisdictions: string[] | null;
  funds_collective_actions: boolean | null;
  case_types: string[] | null;
  min_claim_eur: number | null;
  max_investment_eur: number | null;
  accepts_public_defendants: boolean | null;
  contact: string | null;
  sources: { url: string; title: string }[];
  web_facts?: string[];
};
export type Criterion = { criterion: string; status: "met" | "not_met" | "unknown"; detail: string };
export type Match = { funder: Funder; fit: "strong" | "partial" | "weak"; met: number; not_met: number; unknown: number; criteria: Criterion[]; note: string };
export const getMatches = (id: string, limit?: number) =>
  call<{ case_id: string; claim_base_eur: number | null; total: number; counts: Record<"strong" | "partial" | "weak", number>; matches: Match[] }>(
    `/cases/${id}/matches${limit ? `?limit=${limit}` : ""}`
  );
export const listFunders = () => call<Funder[]>("/funders");

// ---- Radar ----
export type RadarItem = {
  id: string;
  date: string;
  organisation_type: string;
  themes: string;
  decision: string;
  fine_eur: number | null;
  legifrance_url: string | null;
  data_breach: boolean;
  public_body: boolean;
  status: "candidate" | "candidate_public" | "filtered";
  priority: "high" | "medium" | "low" | null;
  reasons: string[];
  case_id: string | null;
  is_new: boolean;
};
export type RadarFeed = {
  source: string;
  scanned_at: string;
  from_cache: boolean;
  stats: { total: number; data_breaches: number; candidates: number; candidates_public: number; filtered: number; high_priority: number; new: number };
  items: RadarItem[];
};
export const getRadar = (query = "") => call<RadarFeed>(`/radar${query ? `?${query}` : ""}`);
export const scanRadar = () => call<{ scanned_at: string; total: number; new: number }>("/radar/scan", { method: "POST" });

// ---- Formatting (euros, French context) ----
export const eur = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1e9 ? `€${(n / 1e9).toFixed(1)}bn` : n >= 1e6 ? `€${(n / 1e6).toFixed(1)}M` : `€${Math.round(n).toLocaleString("en-US")}`;
export const num = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US"));
export const day = (d: string | null | undefined) =>
  d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

// ---- Workflow: monitoring, workspace, finalize & send ----
export type MonitorState = {
  interval_hours: number;
  last_run: string | null;
  next_run: string | null;
  last_result: { total: number; new: number; new_candidates: number; emails: number; from_cache: boolean } | null;
  error: string | null;
};
export type Email = { id: string; kind: "radar_alert" | "brief_to_funder"; to: string; to_name: string; subject: string; body: string; related: Record<string, unknown>; sent_at: string };
export type WorkItem = {
  radar_id: string;
  case_id: string | null;
  organisation_type: string;
  date: string;
  fine_eur: number | null;
  legifrance_url: string | null;
  status: "ready" | "analysis_requested";
  started_at: string;
};
export type Delivery = { id: string; case_id: string; funder_id: string; funder_name: string; message: string | null; sent_at: string };

export const getMonitor = () => call<MonitorState>("/monitor");
export const getOutbox = (kind?: Email["kind"]) => call<Email[]>(`/outbox${kind ? `?kind=${kind}` : ""}`);
export const listWorkspace = () => call<WorkItem[]>("/workspace");
export const startWork = (radarId: string) => call<WorkItem>("/workspace", { method: "POST", body: JSON.stringify({ radar_id: radarId }) });
export const finalizeBrief = (id: string) => call<{ brief: Brief }>(`/cases/${id}/finalize`, { method: "POST" });
export const reopenBrief = (id: string) => call<{ brief: Brief }>(`/cases/${id}/reopen`, { method: "POST" });
export const sendToFunders = (id: string, funderIds: string[], message: string) =>
  call<{ sent: Delivery[]; deliveries: Delivery[] }>(`/cases/${id}/send`, { method: "POST", body: JSON.stringify({ funder_ids: funderIds, message }) });
export const getDeliveries = (id: string) => call<Delivery[]>(`/cases/${id}/deliveries`);

// ---- Funder side ----
export type ReceivedPitch = Delivery & {
  defendant: string;
  action_name: string | null;
  association: string | null;
  decision: { authority: string; reference: string; date: string } | null;
  victims: number | null;
  victims_unit: string | null;
  claim_low_eur: number | null;
  claim_base_eur: number | null;
  claim_high_eur: number | null;
  harm_category: string | null;
  solvency: string | null;
  funding_sought_eur: number | null;
};
export type FunderDashboard = {
  funder: { id: string; name: string; funder_type: string | null };
  pitches_received: number;
  total_claim_base_eur: number;
  total_victims: number;
  by_category: { label: string; n: number }[];
  by_solvency: { label: string; n: number }[];
  latest: ReceivedPitch[];
};
export const getFunderPitches = (id: string) => call<ReceivedPitch[]>(`/funders/${id}/pitches`);
export const getFunderDashboard = (id: string) => call<FunderDashboard>(`/funders/${id}/dashboard`);
export const listAllDeliveries = () => call<Delivery[]>("/deliveries");
