import { Response } from "express";
import { ChatService } from "../services/chat.service";
import { SubscriptionService } from "../services/subscription.service";
import { AuthRequest } from "../middlewares/auth.middleware";
import { localFileStorage } from "../utils/local-storage";
import path from "path";


/**
 * Get or create conversation between client and provider
 */
export const getOrCreateConversation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get authenticated user (SECURE)
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const currentUserId = req.user.id;
    const { providerId, clientId, friendId } = req.body;

    // Debug logging
    console.log('Chat conversation request:', {
      currentUserId,
      providerId,
      clientId,
      friendId,
      body: req.body
    });

    // Determine if current user is client or provider
    let actualClientId: string;
    let actualProviderId: string;

    if (providerId) {
      // Current user is client, wants to message provider
      actualClientId = currentUserId;
      actualProviderId = providerId;
    } else if (clientId) {
      // Current user is provider, wants to message client
      actualClientId = clientId;
      actualProviderId = currentUserId;
    } else if (friendId) {
      // Current user is client, wants to message friend (also client)
      // For friend conversations, we'll use the current user as clientId and friend as providerId
      // This is a workaround since the current schema expects clientId and providerId
      actualClientId = currentUserId;
      actualProviderId = friendId;
    } else {
      console.log('❌ Chat conversation validation failed:', {
        providerId: !!providerId,
        clientId: !!clientId,
        friendId: !!friendId,
        bodyKeys: Object.keys(req.body),
        bodyValues: req.body
      });
      res.status(400).json({
        status: false,
        message: 'Either providerId, clientId, or friendId is required',
      });
      return;
    }

    // Check if client has uploaded identity document (required before chatting with providers)
    if (providerId && !friendId && req.user.role === 'client') {
      if (!req.user.identityDocumentUrl) {
        res.status(403).json({
          status: false,
          message: 'Identity verification required',
          requiresIdentityDocument: true,
          reason: 'Please upload a government-issued ID before chatting with providers.',
        });
        return;
      }
    }

    // Subscription limits only apply when a client messages a provider.
    // Friend chats (friendId) and provider→client chats are always allowed.
    if (providerId && !friendId && req.user.role === 'client') {
      const areFriends = await ChatService.areUsersFriends(actualClientId, actualProviderId);

      if (!areFriends) {
        const canMessage = await SubscriptionService.canClientMessage(actualClientId, actualProviderId);
        if (!canMessage.canMessage) {
          res.status(403).json({
            status: false,
            message: canMessage.reason,
            requiresSubscription: canMessage.requiresSubscription ?? false,
          });
          return;
        }
      }
    }
    // Provider messaging client - always allowed
    // Friend messaging friend - always allowed

    const conversation = await ChatService.getOrCreateConversation(
      actualClientId,
      actualProviderId,
      { isFriendChat: !!friendId }
    );

    res.status(200).json({
      status: true,
      message: 'Conversation retrieved successfully',
      data: conversation,
    });
  } catch (error) {
    console.error('Error getting conversation:', error);
    res.status(500).json({
      status: false,
      message: 'Internal server error',
      ...(process.env.SEND_ERRORS === 'true' && {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    });
  }
};

/**
 * Send a message in a conversation
 */
export const sendMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get authenticated user (SECURE)
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const senderId = req.user.id;
    const { conversationId, content, messageType = 'text', attachments } = req.body;

    // Log the request body for debugging
    console.log('Send message request:', {
      conversationId,
      content,
      messageType,
      attachments,
      senderId
    });

    if (!conversationId) {
      res.status(400).json({
        status: false,
        message: 'Conversation ID is required',
      });
      return;
    }

    // For text messages, content is required. For image messages, attachments are required
    if (messageType === 'text' && !content) {
      res.status(400).json({
        status: false,
        message: 'Content is required for text messages',
      });
      return;
    }

    if (messageType === 'image' && (!attachments || (!attachments.imageUrl && !attachments.url))) {
      res.status(400).json({
        status: false,
        message: 'Image URL is required for image messages',
      });
      return;
    }

    if (messageType === 'reel' && (!attachments || !attachments.videoId)) {
      res.status(400).json({
        status: false,
        message: 'Reel video ID is required for reel messages',
      });
      return;
    }

    const result = await ChatService.sendMessage(
      conversationId,
      senderId,
      content,
      messageType,
      attachments
    );

    if (!result.canSend) {
      res.status(403).json({
        status: false,
        message: result.reason,
        messageLimitReached: result.messageLimitReached === true,
        requiresSubscription: result.requiresSubscription === true,
      });
      return;
    }

    // Emit Socket.IO event for real-time messaging
    if ((global as any).socketService) {
      (global as any).socketService.sendMessageToConversation(conversationId, {
        data: result.message,
        conversationId: conversationId,
      });
    }

    res.status(201).json({
      status: true,
      message: 'Message sent successfully',
      data: result.message,
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      status: false,
      message: 'Internal server error',
      ...(process.env.SEND_ERRORS === 'true' && {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    });
  }
};

/**
 * Get messages in a conversation
 */
export const getConversationMessages = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get authenticated user (SECURE)
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const userId = req.user.id;
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const result = await ChatService.getConversationMessages(
      conversationId,
      userId,
      parseInt(page as string),
      parseInt(limit as string)
    );

    res.status(200).json({
      status: true,
      message: 'Messages retrieved successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({
      status: false,
      message: 'Internal server error',
      ...(process.env.SEND_ERRORS === 'true' && {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    });
  }
};

/**
 * Get user's conversations
 */
export const getUserConversations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get authenticated user (SECURE)
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const result = await ChatService.getUserConversations(
      userId,
      parseInt(page as string),
      parseInt(limit as string)
    );

    res.status(200).json({
      status: true,
      message: 'Conversations retrieved successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error getting conversations:', error);
    res.status(500).json({
      status: false,
      message: 'Internal server error',
      ...(process.env.SEND_ERRORS === 'true' && {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    });
  }
};

/**
 * Mark messages as read
 */
export const markMessagesAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get authenticated user (SECURE)
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const userId = req.user.id;
    const { conversationId } = req.params;

    await ChatService.markMessagesAsRead(conversationId, userId);

    res.status(200).json({
      status: true,
      message: 'Messages marked as read',
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({
      status: false,
      message: 'Internal server error',
      ...(process.env.SEND_ERRORS === 'true' && {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    });
  }
};

/**
 * Get unread message count
 */
export const getUnreadMessageCount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get authenticated user (SECURE)
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const userId = req.user.id;
    const count = await ChatService.getUnreadMessageCount(userId);

    res.status(200).json({
      status: true,
      message: 'Unread count retrieved successfully',
      data: { unreadCount: count },
    });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({
      status: false,
      message: 'Internal server error',
      ...(process.env.SEND_ERRORS === 'true' && {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    });
  }
};

/**
 * Update conversation status (block/unblock)
 */
export const updateConversationStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get authenticated user (SECURE)
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const userId = req.user.id;
    const { conversationId } = req.params;
    const { status } = req.body;

    if (!['active', 'blocked'].includes(status)) {
      res.status(400).json({
        status: false,
        message: 'Invalid status. Must be "active" or "blocked"',
      });
      return;
    }

    await ChatService.updateConversationStatus(conversationId, userId, status);

    res.status(200).json({
      status: true,
      message: `Conversation ${status === 'blocked' ? 'blocked' : 'unblocked'} successfully`,
    });
  } catch (error) {
    console.error('Error updating conversation status:', error);
    res.status(500).json({
      status: false,
      message: 'Internal server error',
      ...(process.env.SEND_ERRORS === 'true' && {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    });
  }
};

/**
 * Upload image for chat
 */
export const uploadChatImage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get authenticated user (SECURE)
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    // Check if file was uploaded
    if (!req.file) {
      res.status(400).json({
        status: false,
        message: 'No image file provided',
      });
      return;
    }

    const file = req.file;

    // File validation is already handled by multer middleware
    // Just log the file info for debugging
    console.log('Uploaded file:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      filename: file.filename
    });

    // The file is already stored by multer, we just need to get the URL
    const relativePath = path.join('chat-images', file.filename).replace(/\\/g, '/');
    const imageUrl = localFileStorage.getPublicUrl(relativePath);

    res.status(200).json({
      status: true,
      message: 'Image uploaded successfully',
      data: {
        imageUrl,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
      },
    });
  } catch (error) {
    console.error('Error uploading chat image:', error);
    res.status(500).json({
      status: false,
      message: 'Internal server error',
      ...(process.env.SEND_ERRORS === 'true' && {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    });
  }
};
