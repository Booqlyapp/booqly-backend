import { Router } from 'express';
import {
  getOrCreateConversation,
  sendMessage,
  getConversationMessages,
  getUserConversations,
  markMessagesAsRead,
  getUnreadMessageCount,
  updateConversationStatus,
  uploadChatImage,
} from '../controllers/chat.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validate, schemas } from '../middlewares/validation.middleware';
import { upload } from '../utils/multer-config';

const router = Router();

// All chat routes require authentication
router.use(authenticateToken);

// Get or create conversation
router.post('/conversations', validate(schemas.createConversation), getOrCreateConversation);

// Send message
router.post('/messages', validate(schemas.sendMessage), sendMessage);

// Get user's conversations
router.get('/conversations', getUserConversations);

// Get conversation messages
router.get('/conversations/:conversationId/messages', getConversationMessages);

// Mark messages as read
router.put('/conversations/:conversationId/read', markMessagesAsRead);

// Get unread message count
router.get('/unread-count', getUnreadMessageCount);

// Update conversation status (block/unblock)
router.put('/conversations/:conversationId/status', updateConversationStatus);

// Upload image for chat
router.post('/upload-image', upload.single('image'), uploadChatImage);

export default router;
