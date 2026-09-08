import { Router } from "express";
import {
  getModerationQueue,
  resolveFlag,
  updateReviewByAdmin,
  reclassifyReview,
  deleteReviewByAdmin,
  updateSemiVerifiedStatus,
} from "../controllers/admin_review_controller";
import { authenticateToken, requireRole } from "../middlewares/auth.middleware";
import { validate, validateQuery, validateUUID, schemas } from "../middlewares/validation.middleware";

const router = Router();

router.use(authenticateToken, requireRole("admin"));

// Paginated moderation queue (flags + semi-verified)
router.get(
  "/moderation",
  validateQuery(schemas.adminReviewModeration),
  getModerationQueue
);

// Approve or reject a flagged review
router.put(
  "/flags/:flagId/resolve",
  validateUUID("flagId"),
  validate(schemas.adminResolveFlag),
  resolveFlag
);

// Approve/reject semi-verified review submissions
router.put(
  "/:reviewId/status",
  validateUUID("reviewId"),
  validate(schemas.adminUpdateReviewStatus),
  updateSemiVerifiedStatus
);

// Edit review content/visibility
router.put(
  "/:reviewId",
  validateUUID("reviewId"),
  validate(schemas.adminUpdateReview),
  updateReviewByAdmin
);

// Reclassify review label (verified / semi_verified)
router.put(
  "/:reviewId/reclassify",
  validateUUID("reviewId"),
  validate(schemas.adminReclassifyReview),
  reclassifyReview
);

// Hard delete a review
router.delete("/:reviewId", validateUUID("reviewId"), deleteReviewByAdmin);

export default router;
