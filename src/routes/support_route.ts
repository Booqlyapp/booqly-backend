import { Router } from "express";
import {
  createSupportTicketUser,
  listMySupportTickets,
  getMySupportTicket,
  addMySupportTicketMessage,
  uploadSupportAttachment,
} from "../controllers/support_ticket.controller";
import { authenticateToken } from "../middlewares/auth.middleware";
import { validate, validateQuery, validateUUID, schemas } from "../middlewares/validation.middleware";
import { createSupportAttachmentUpload } from "../utils/multer-config";

const router = Router();
const upload = createSupportAttachmentUpload();

router.use(authenticateToken);

router.post("/tickets", validate(schemas.createSupportTicket), createSupportTicketUser);
router.get("/tickets", validateQuery(schemas.listMySupportTickets), listMySupportTickets);
router.get("/tickets/:id", validateUUID("id"), getMySupportTicket);
router.post(
  "/tickets/:id/messages",
  validateUUID("id"),
  validate(schemas.addSupportTicketMessage),
  addMySupportTicketMessage
);
router.post("/attachments", upload.single("file"), uploadSupportAttachment);

export default router;
