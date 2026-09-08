import { Router } from "express";
import {
  cancelWaitlistEntry,
  claimWaitlistSpot,
  getMarketplaceWaitlist,
  getMyWaitlistEntries,
  joinWaitlist,
} from "../controllers/waitlist_controller";
import { authenticateToken, requireRole } from "../middlewares/auth.middleware";

const router = Router();

router.post("/join", authenticateToken, requireRole(["client"]), joinWaitlist);
router.get("/my", authenticateToken, requireRole(["client"]), getMyWaitlistEntries);
router.post("/claim", authenticateToken, requireRole(["client"]), claimWaitlistSpot);
router.delete("/cancel/:waitlistId", authenticateToken, requireRole(["client"]), cancelWaitlistEntry);
router.get("/marketplace", authenticateToken, requireRole(["solo", "suite"]), getMarketplaceWaitlist);

export default router;
