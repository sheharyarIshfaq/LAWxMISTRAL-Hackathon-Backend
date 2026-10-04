import { Router, type Request, type Response } from "express";
import { listDeliveries, listWork, startWork, WorkflowError } from "../services/workspace.ts";
import { getMonitorState, runMonitor } from "../services/monitor.ts";
import { listEmails } from "../services/outbox.ts";

const router = Router();

// The association's cases (decisions it chose to work on).
router.get("/workspace", async (_req: Request, res: Response) => res.json(await listWork()));
router.post("/workspace", async (req: Request, res: Response) => {
  const id = req.body?.radar_id;
  if (typeof id !== "string") return res.status(400).json({ error: "Body must be { radar_id }" });
  try {
    res.json(await startWork(id));
  } catch (err) {
    if (err instanceof WorkflowError) return res.status(400).json({ error: err.message });
    throw err;
  }
});

// Every brief sent to a funder (used by the funder picker on the funder desk).
router.get("/deliveries", async (_req, res) => res.json(await listDeliveries()));

// Background monitoring status; POST runs it now (operator/demo use, not shown to associations).
router.get("/monitor", async (_req, res) => res.json(await getMonitorState()));
router.post("/monitor/run", async (_req, res) => res.json(await runMonitor()));

// Outbox: emails the platform "sent" (alerts to associations, briefs to funders). ?kind=radar_alert|brief_to_funder
router.get("/outbox", async (req, res) => res.json(await listEmails({ kind: typeof req.query.kind === "string" ? req.query.kind : undefined })));

export default router;
