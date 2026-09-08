import { Router } from "express";
import { updateSocialHandle, updateMarketplaceSocials, updateClientSocials } from "../controllers/social_controller";
import { authenticateToken, requireVerification } from "../middlewares/auth.middleware";

const router = Router();

router.put("/update-social-handle", authenticateToken, requireVerification, updateSocialHandle);
router.put("/update-marketplace-socials", authenticateToken, requireVerification, updateMarketplaceSocials);
router.put("/update-client-socials", authenticateToken, requireVerification, updateClientSocials);

export default router;
