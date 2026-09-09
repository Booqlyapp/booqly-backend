import { Router } from "express";
import { redirectToReelShortLink } from "../controllers/video.controller";

const router = Router();

/**
 * @route GET /r/:code
 * @desc Public TikTok-style short link - redirects straight to the reel video
 * @access Public
 */
router.get("/r/:code", redirectToReelShortLink);

export default router;