import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.middleware";
import {
  searchUsers,
  sendFriendRequest,
  getFriends,
  acceptFriendRequest,
  deleteFriend,
  blockUser
} from "../controllers/friend_controller";

const router = Router();

// All friend routes require authentication
router.use(authenticateToken);

// Search for users to add as friends
router.get("/search", searchUsers);

// Get user's friends list (accepted, pending, blocked)
router.get("/", getFriends);

// Send friend request
router.post("/request", sendFriendRequest);

// Accept friend request
router.put("/:friendshipId/accept", acceptFriendRequest);

// Delete friend or reject friend request
router.delete("/:friendshipId", deleteFriend);

// Block user
router.put("/:friendshipId/block", blockUser);

export default router;
