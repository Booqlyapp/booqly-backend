import { Router } from "express";
import {
  createMarketplaceForUser,
  getMarketplaces,
  getMarketplaceById,
  updateMarketplace,
  updateMarketplaceImages,
  updateMarketplacePortfolio,
  updateMarketplaceEssentials,
  updateMarketplaceBio,
  updateMarketplacePolicyRules,
  updateMarketplaceCustomLink,
  updateShowPolicyRules,
  updateWaitlistSettings,
  updateBookingPageCustomization,
} from "../controllers/marketplace_controller";
import { updateMarketplaceSocials } from "../controllers/social_controller";
import { authenticateToken, requireRole, requireVerification, optionalAuth } from "../middlewares/auth.middleware";
import { createMarketplaceImagesUpload, createPortfolioImagesUpload, createWebHeaderUpload } from "../utils/multer-config";

const router = Router();

// Configure multer for marketplace images
const marketplaceUpload = createMarketplaceImagesUpload();
const portfolioUpload = createPortfolioImagesUpload();
const webHeaderUpload = createWebHeaderUpload();

router.post(
  "/create-marketplace-profile",
  authenticateToken,
  requireRole(['solo', 'suite']),
  // requireVerification,
  marketplaceUpload.array("images", 10),
  createMarketplaceForUser
);
router.put("/update-marketplace", authenticateToken, requireVerification, updateMarketplace);
router.put("/update-marketplace-essentials", authenticateToken, requireVerification, updateMarketplaceEssentials);
router.put("/update-marketplace-bio", authenticateToken, requireVerification, updateMarketplaceBio);
router.put("/update-marketplace-policy-rules", authenticateToken, requireVerification, updateMarketplacePolicyRules);
router.put("/update-marketplace-custom-link", authenticateToken, requireVerification, updateMarketplaceCustomLink);
router.put("/update-show-policy-rules", authenticateToken, requireVerification, updateShowPolicyRules);
router.put("/update-waitlist-settings", authenticateToken, requireVerification, updateWaitlistSettings);
router.post(
  "/update-booking-page-customization",
  authenticateToken,
  requireVerification,
  webHeaderUpload.fields([
    { name: 'headerImage', maxCount: 1 },
    { name: 'headerPdf', maxCount: 1 }
  ]),
  updateBookingPageCustomization
);
router.put("/update-marketplace-socials", authenticateToken, requireVerification, updateMarketplaceSocials);
router.post(
  "/update-marketplace-images",
  authenticateToken,
  requireVerification,
  marketplaceUpload.array("images", 10),
  updateMarketplaceImages
);
router.post(
  "/update-marketplace-portfolio",
  authenticateToken,
  requireVerification,
  portfolioUpload.array("portfolioImages", 10),
  updateMarketplacePortfolio
);
router.get("/get-marketplaces", getMarketplaces);
router.get("/:id", optionalAuth, getMarketplaceById);

export default router;
