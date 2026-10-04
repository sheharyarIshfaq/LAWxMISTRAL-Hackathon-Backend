import { Router } from "express";
import * as radar from "../controllers/radar.controller.ts";

const router = Router();

router.get("/", radar.getRadar);
router.post("/scan", radar.postScan);

export default router;
