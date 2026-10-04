import { Router } from "express";
import * as cases from "../controllers/cases.controller.ts";

const router = Router();

router.get("/", cases.listCases);
router.post("/", cases.createCase);
router.get("/:id", cases.getCase);
router.get("/:id/pitch", cases.getPitch);
router.patch("/:id/brief", cases.editBrief);
router.get("/:id/scorecard", cases.getScorecard);
router.get("/:id/pages/:n", cases.getPage);
router.post("/:id/chat", cases.chat);

export default router;
