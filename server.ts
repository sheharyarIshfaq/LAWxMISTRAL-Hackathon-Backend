import "dotenv/config";
import express from "express";

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

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
