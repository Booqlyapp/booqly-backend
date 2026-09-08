import { Router } from "express";
import {
  getAnnouncementStats,
  listAnnouncements,
  getAnnouncementById,
  createAnnouncement,
  updateAnnouncement,
  publishAnnouncement,
  scheduleAnnouncement,
  unpublishAnnouncement,
  deleteAnnouncement,
} from "../controllers/admin_announcement_controller";
import { authenticateToken, requireRole } from "../middlewares/auth.middleware";
import { validate, validateQuery, validateUUID, schemas } from "../middlewares/validation.middleware";

const router = Router();

router.use(authenticateToken, requireRole("admin"));

router.get("/stats", getAnnouncementStats);
router.get("/", validateQuery(schemas.adminListAnnouncements), listAnnouncements);
router.get("/:id", validateUUID("id"), getAnnouncementById);
router.post("/", validate(schemas.createAnnouncement), createAnnouncement);
router.put("/:id", validateUUID("id"), validate(schemas.updateAnnouncement), updateAnnouncement);
router.post("/:id/publish", validateUUID("id"), publishAnnouncement);
router.post(
  "/:id/schedule",
  validateUUID("id"),
  validate(schemas.scheduleAnnouncement),
  scheduleAnnouncement
);
router.post("/:id/unpublish", validateUUID("id"), unpublishAnnouncement);
router.delete("/:id", validateUUID("id"), deleteAnnouncement);

export default router;
