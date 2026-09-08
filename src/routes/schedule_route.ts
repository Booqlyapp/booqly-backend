import { Router } from "express";
import { updateSchedule, updateMarketplaceSchedule } from "../controllers/schedule_controller";
import { authenticateToken, requireVerification } from "../middlewares/auth.middleware";

const router = Router();

router.put("/update-schedule", authenticateToken, requireVerification, updateSchedule);
router.put("/update-marketplace-schedule", authenticateToken, requireVerification, updateMarketplaceSchedule);

export default router;
