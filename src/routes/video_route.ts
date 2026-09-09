import { Router } from "express";
import {
  addVideoComment,
  deleteComment,
  deleteVideo,
  dislikeComment,
  followReelUser,
  getCommentReplies,
  getFeedVideos,
  getVideoById,
  getVideoByShortCode,
  getVideoComments,
  getReelUserProfile,
  getVideosByUser,
  likeComment,
  likeVideo,
  removeCommentReaction,
  unfollowReelUser,
  unlikeVideo,
  updateVideo,
  uploadVideo,
} from "../controllers/video.controller";
import { authenticateToken, optionalAuth } from "../middlewares/auth.middleware";
import { uploadRateLimit } from "../middlewares/security.middleware";
import { createVideoUpload } from "../utils/multer-config";

const router = Router();
const videoUpload = createVideoUpload();

router.post(
  "/upload",
  authenticateToken,
  uploadRateLimit,
  videoUpload.fields([
    { name: "video", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  uploadVideo
);

router.get("/users/:userId/videos", optionalAuth, getVideosByUser);
router.get("/users/:userId/profile", optionalAuth, getReelUserProfile);
router.post("/users/:userId/follow", authenticateToken, followReelUser);
router.delete("/users/:userId/follow", authenticateToken, unfollowReelUser);
router.get("/feed", optionalAuth, getFeedVideos);
router.get("/by-short-code/:code", optionalAuth, getVideoByShortCode);
router.get("/:videoId", optionalAuth, getVideoById);
router.patch("/:videoId", authenticateToken, updateVideo);
router.delete("/:videoId", authenticateToken, deleteVideo);
router.get("/:videoId/comments", optionalAuth, getVideoComments);

router.post("/:videoId/like", authenticateToken, likeVideo);
router.delete("/:videoId/like", authenticateToken, unlikeVideo);
router.post("/:videoId/comments", authenticateToken, addVideoComment);

router.get("/comments/:commentId/replies", optionalAuth, getCommentReplies);
router.post("/comments/:commentId/like", authenticateToken, likeComment);
router.post("/comments/:commentId/dislike", authenticateToken, dislikeComment);
router.delete("/comments/:commentId/reaction", authenticateToken, removeCommentReaction);
router.delete("/comments/:commentId", authenticateToken, deleteComment);

export default router;