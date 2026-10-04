import "dotenv/config";
import express from "express";
import { cors } from "./middleware/cors.ts";
import { errorHandler } from "./middleware/errorHandler.ts";
import healthRoutes from "./routes/health.routes.ts";
import casesRoutes from "./routes/cases.routes.ts";

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(cors);

app.use("/health", healthRoutes);
app.use("/cases", casesRoutes);

app.use(errorHandler);

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
