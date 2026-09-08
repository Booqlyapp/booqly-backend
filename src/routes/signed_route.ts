import { Router } from "express";
import { createSignedUrlForVerification } from "../controllers/signed_controller";

const router = Router();

router.post(
  "/create-signed-url-verification",
  createSignedUrlForVerification
);

export default router;
