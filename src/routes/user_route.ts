import { Router } from "express";
import {
  updateUserData,
  uploadUserProfilePic,
  removeUserProfilePic,
  uploadIdentityDocument,
  uploadProfessionalDocument,
  uploadBusinessDocument,
  getUserProfile,
  deleteUserAccount,
  updateUserStatus,
  changeUserEmail,
  changeUserEmailAndPhone,
  changeUserPassword,
  getClientUsers,
  getClientProfileById,
  updateUserFcmToken,
} from "../controllers/user_controller";
import validateUser from "../middlewares/validate_user";
import { validate, schemas, validateUUID } from "../middlewares/validation.middleware";
import { authenticateToken, requireRole } from "../middlewares/auth.middleware";
import {
  createProfilePicUpload,
  createIdentityDocUpload,
  createProfessionalDocUpload,
  createBusinessDocUpload,
} from "../utils/multer-config";

const upload = createProfilePicUpload();
const identityDocUpload = createIdentityDocUpload();
const professionalDocUpload = createProfessionalDocUpload();
const businessDocUpload = createBusinessDocUpload();
const router = Router();

// Get user profile (requires authentication)
router.get("/profile", authenticateToken, getUserProfile);

// Get a client's profile (providers only)
router.get(
  "/clients/:userId",
  authenticateToken,
  requireRole(["solo", "suite"]),
  validateUUID("userId"),
  getClientProfileById
);

// Update user data (requires authentication)
router.put("/update-user-data", authenticateToken, validate(schemas.updateUser), updateUserData);

// Update user FCM token (requires authentication)
router.put("/update-fcm-token", authenticateToken, validate(schemas.updateUserFcmToken), updateUserFcmToken);

// Upload profile picture (requires authentication)
router.post(
  "/upload-profile-pic",
  authenticateToken,
  upload.single("profilePic"),
  uploadUserProfilePic
);

// Remove profile picture (requires authentication)
router.delete("/remove-profile-pic", authenticateToken, removeUserProfilePic);

// Upload identity document (requires authentication)
router.post(
  "/upload-identity-document",
  authenticateToken,
  identityDocUpload.single("identityDocument"),
  uploadIdentityDocument
);

// Upload professional license document (solo, requires authentication)
router.post(
  "/upload-professional-document",
  authenticateToken,
  professionalDocUpload.single("professionalDocument"),
  uploadProfessionalDocument
);

// Upload business document (solo, requires authentication)
router.post(
  "/upload-business-document",
  authenticateToken,
  businessDocUpload.single("businessDocument"),
  uploadBusinessDocument
);

// Delete user account (requires authentication)
router.delete("/delete-account", authenticateToken, validate(schemas.deleteUser), deleteUserAccount);

// Change user email (secure endpoint)
router.put("/change-email", authenticateToken, validate(schemas.changeUserEmail), changeUserEmail);

// Change user email and phone (secure endpoint)
router.put("/change-email-phone", authenticateToken, validate(schemas.changeUserEmailAndPhone), changeUserEmailAndPhone);

// Change user password (secure endpoint)
router.put("/change-password", authenticateToken, validate(schemas.changeUserPassword), changeUserPassword);

// Update user status (admin only - for now, any authenticated user can call this)
router.put("/update-status", authenticateToken, validate(schemas.updateUserStatus), updateUserStatus);

// Get client users for promotion sharing (providers only)
router.get("/clients", authenticateToken, requireRole(['solo', 'suite']), getClientUsers);

export default router;
