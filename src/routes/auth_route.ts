import { Router } from "express";
import {
  registerUser,
  signInUser,
  userLoggedInOrVerificationStatus,
  forgotPassword,
  resetPassword,
} from "../controllers/auth_controller";
import { validate, schemas } from "../middlewares/validation.middleware";

const router = Router();

router.post("/register", validate(schemas.registerUser), registerUser);
router.post("/login", validate(schemas.loginUser), signInUser);
router.get(
  "/user-auth-or-verfication-status",
  userLoggedInOrVerificationStatus
);
router.post("/forgot-password", validate(schemas.forgotPassword), forgotPassword);
router.post("/reset-password", validate(schemas.resetPasswordWithOtp), resetPassword);

export default router;
