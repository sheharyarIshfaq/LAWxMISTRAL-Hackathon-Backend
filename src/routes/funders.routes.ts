import { Router } from "express";
import * as funders from "../controllers/funders.controller.ts";

const router = Router();

router.get("/", funders.getFunders);
router.post("/", funders.createFunder);
router.post("/discover", funders.discover);

export default router;
