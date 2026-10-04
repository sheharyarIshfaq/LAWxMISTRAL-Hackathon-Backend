import "dotenv/config";
import express from "express";
import { cors } from "./middleware/cors.ts";
import { errorHandler, notFound } from "./middleware/errorHandler.ts";
import healthRoutes from "./routes/health.routes.ts";
import casesRoutes from "./routes/cases.routes.ts";
import fundersRoutes from "./routes/funders.routes.ts";
import radarRoutes from "./routes/radar.routes.ts";
import workspaceRoutes from "./routes/workspace.routes.ts";
import { startMonitor } from "./services/monitor.ts";

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(cors);

app.use("/health", healthRoutes);
app.use("/cases", casesRoutes);
app.use("/funders", fundersRoutes);
app.use("/radar", radarRoutes);
app.use("/", workspaceRoutes);
// Decision PDFs, so summary citations can open /decisions/<id>.pdf#page=N when no Légifrance URL is set.
app.use("/decisions", express.static("decisions"));

app.use(notFound);
app.use(errorHandler);

// Last line of defence: log and keep serving instead of crashing during the demo.
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`API on http://localhost:${PORT}`);
  if (process.env.MONITOR !== "off") startMonitor();
});
