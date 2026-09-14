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
  uploadChatVideo,
} from '../controllers/chat.controller';
import { authenticateToken } from '../middlewares/auth.middleware';
import { validate, schemas } from '../middlewares/validation.middleware';
import { upload, createChatVideoUpload } from '../utils/multer-config';

const router = Router();
const videoUpload = createChatVideoUpload();

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

// Upload video for chat
router.post('/upload-video', (req, res, next) => {
  videoUpload.single('video')(req, res, (err: any) => {
    if (err) {
      res.status(400).json({
        status: false,
        message: err.message || 'Failed to upload video',
      });
      return;
    }
    next();
  });
}, uploadChatVideo);

export default router;
