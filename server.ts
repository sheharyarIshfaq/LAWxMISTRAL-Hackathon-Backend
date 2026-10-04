import "dotenv/config";
import express from "express";
import { listCaseIds, readJson, readText, NotFound, type Page } from "./storage.ts";

const app = express();
app.use(express.json({ limit: "5mb" }));

// Allow the React dev server (different port) to call us.
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, mistral_key_set: Boolean(process.env.MISTRAL_API_KEY) });
});

app.get("/cases", async (_req, res) => {
  const cases = await Promise.all(
    (await listCaseIds()).map(async (id) => {
      const c = await readJson(id, "case.json");
      return {
        id,
        defendant: c.defendant?.name ?? null,
        date: c.decision?.date ?? null,
        fine_total_eur: c.decision?.fine_total_eur ?? null,
        people_affected: c.breach?.people_affected ?? null,
        data_types: c.breach?.data_types ?? [],
        mock: Boolean(c.mock),
      };
    })
  );
  cases.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  res.json(cases);
});

app.get("/cases/:id", async (req, res) => {
  res.json(await readJson(req.params.id, "case.json"));
});

app.get("/cases/:id/pitch", async (req, res) => {
  res.json({ markdown: await readText(req.params.id, "pitch.md") });
});

app.get("/cases/:id/scorecard", async (req, res) => {
  const { claims, scores, red_flags, summary, mock } = await readJson(req.params.id, "scorecard.json");
  res.json({ claims, scores, red_flags, summary, mock: Boolean(mock) });
});

app.get("/cases/:id/pages/:n", async (req, res) => {
  const pages = await readJson<Page[]>(req.params.id, "pages.json");
  const page = pages.find((p) => p.page === Number(req.params.n));
  if (!page) throw new NotFound(`Page ${req.params.n} not found`);
  res.json({ page: page.page, text: page.text });
});

app.post("/cases/:id/chat", (_req, res) => {
  res.status(501).json({ error: "Chat not implemented yet" });
});

app.post("/cases", (_req, res) => {
  res.status(501).json({ error: "Pipeline not implemented yet" });
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof NotFound) return res.status(404).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: err?.message ?? "Internal error" });
});

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
