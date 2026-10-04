import { Router } from "express";
import * as cases from "../controllers/cases.controller.ts";

const router = Router();

router.get("/", cases.listCases);
router.post("/", cases.createCase);
router.get("/:id", cases.getCase);
router.get("/:id/pitch", cases.getPitch);
router.patch("/:id/brief", cases.editBrief);
router.get("/:id/brief.pdf", cases.getBriefPdf);
router.get("/:id/brief.html", cases.getBriefHtml);
router.get("/:id/summary", cases.getSummary);
router.get("/:id/pages/:n", cases.getPage);
router.post("/:id/chat", cases.chat);
router.get("/:id/matches", cases.getMatches);
router.post("/:id/finalize", cases.finalizeBrief);
router.post("/:id/reopen", cases.reopenBrief);
router.post("/:id/send", cases.sendToFunders);
router.get("/:id/deliveries", cases.getDeliveries);

export default router;
