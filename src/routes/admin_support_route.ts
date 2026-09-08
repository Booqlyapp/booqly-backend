import { Router } from "express";
import {
  getSupportStats,
  listSupportTicketsAdmin,
  getSupportTicketAdmin,
  createSupportTicketAdmin,
  updateSupportTicketAdmin,
  addSupportTicketMessageAdmin,
  listSupportAssignees,
  uploadSupportAttachment,
} from "../controllers/support_ticket.controller";
import { authenticateToken, requireRole } from "../middlewares/auth.middleware";
import { validate, validateQuery, validateUUID, schemas } from "../middlewares/validation.middleware";
import { createSupportAttachmentUpload } from "../utils/multer-config";

const router = Router();
const upload = createSupportAttachmentUpload();

router.use(authenticateToken, requireRole("admin"));

router.get("/stats", getSupportStats);
router.get("/assignees", listSupportAssignees);
router.get("/tickets", validateQuery(schemas.adminListSupportTickets), listSupportTicketsAdmin);
router.get("/tickets/:id", validateUUID("id"), getSupportTicketAdmin);
router.post("/tickets", validate(schemas.adminCreateSupportTicket), createSupportTicketAdmin);
router.put("/tickets/:id", validateUUID("id"), validate(schemas.updateSupportTicket), updateSupportTicketAdmin);
router.post(
  "/tickets/:id/messages",
  validateUUID("id"),
  validate(schemas.addSupportTicketMessage),
  addSupportTicketMessageAdmin
);
router.post("/attachments", upload.single("file"), uploadSupportAttachment);

export default router;
