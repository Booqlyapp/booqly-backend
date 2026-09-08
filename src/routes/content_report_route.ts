import { Router } from "express";
import { createContentReport } from "../controllers/content_report.controller";
import { authenticateToken } from "../middlewares/auth.middleware";
import { validate, schemas } from "../middlewares/validation.middleware";

const router = Router();

router.post("/", authenticateToken, validate(schemas.createContentReport), createContentReport);

export default router;
