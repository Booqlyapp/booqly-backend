import { Router } from "express";
import {
  createTeamMember,
  deleteTeamMember,
  getTeamMembers,
  updateTeamMember,
  getTeamMemberPermissions,
  updateTeamMemberPermissions,
  getMyPermissions,
  uploadTeamMemberProfilePic,
} from "../controllers/team_member_controller";
import { authenticateToken, requireRole } from "../middlewares/auth.middleware";
import { schemas, validate } from "../middlewares/validation.middleware";
import { createProfilePicUpload } from "../utils/multer-config";

const router = Router();
const profilePicUpload = createProfilePicUpload();

router.get("/", authenticateToken, requireRole(["suite"]), getTeamMembers);
router.post("/", authenticateToken, requireRole(["suite"]), validate(schemas.createTeamMember), createTeamMember);
router.get("/my-permissions", authenticateToken, requireRole(["suite"]), getMyPermissions);
router.get("/:teamMemberId/permissions", authenticateToken, requireRole(["suite"]), getTeamMemberPermissions);
router.put("/:teamMemberId/permissions", authenticateToken, requireRole(["suite"]), updateTeamMemberPermissions);
router.put("/:teamMemberId", authenticateToken, requireRole(["suite"]), validate(schemas.updateTeamMember), updateTeamMember);
router.post(
  "/:teamMemberId/profile-pic",
  authenticateToken,
  requireRole(["suite"]),
  profilePicUpload.single("profilePic"),
  uploadTeamMemberProfilePic
);
router.delete("/:teamMemberId", authenticateToken, requireRole(["suite"]), deleteTeamMember);

export default router;
