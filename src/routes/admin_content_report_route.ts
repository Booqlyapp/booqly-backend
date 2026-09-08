import { Router } from "express";
import {
  listContentReports,
  getContentReportById,
  resolveContentReport,
} from "../controllers/content_report.controller";
import { authenticateToken, requireRole } from "../middlewares/auth.middleware";
import { validate, validateQuery, validateUUID, schemas } from "../middlewares/validation.middleware";

const router = Router();

router.use(authenticateToken, requireRole("admin"));

router.get("/", validateQuery(schemas.adminListContentReports), listContentReports);
router.get("/:id", validateUUID("id"), getContentReportById);
router.post(
  "/:id/action",
  validateUUID("id"),
  validate(schemas.adminResolveContentReport),
  resolveContentReport
);

export default router;
