import { Router } from "express";
import {
  updateService,
  createService,
  getServices,
  deleteService,
  getServiceById,
} from "../controllers/service_controller";
import { authenticateToken, requireVerification } from "../middlewares/auth.middleware";
import { createServiceImageUpload } from "../utils/multer-config";

const router = Router();

// Configure multer for service images
const serviceImageUpload = createServiceImageUpload();

router.get("/get-services", getServices);
router.get("/get-service/:serviceId", authenticateToken, getServiceById);
router.put("/update-service", authenticateToken, requireVerification, serviceImageUpload.single("serviceImage"), updateService);
router.post("/create-service", authenticateToken, requireVerification, serviceImageUpload.single("serviceImage"), createService);
router.delete("/delete-service", authenticateToken, requireVerification, deleteService);

export default router;
