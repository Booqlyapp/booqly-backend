import { User } from '../models/user_model';
import { Conversation } from '../models/conversation_model';
import { Message } from '../models/message_model';
import { Friend } from '../models/friend_model';
import { SubscriptionService } from './subscription.service';
import { NotificationService } from './notification.service';
import { Op } from 'sequelize';

const CHAT_USER_ATTRIBUTES = [
  'id',
  'name',
  'email',
  'profilePic',
  'role',
  'status',
  'identityVerified',
  'professionalVerified',
  'businessVerified',
] as const;

export class ChatService {

  /**
   * Check whether two users have an accepted friendship.
   */
  static async areUsersFriends(userA: string, userB: string): Promise<boolean> {
    const friendship = await Friend.findOne({
      where: {
        status: 'accepted',
        [Op.or]: [
          { userId: userA, friendId: userB },
          { userId: userB, friendId: userA },
        ],
      },
    });

    return friendship !== null;
  }

  /**
   * Clear provider-style limits on conversations between friends.
   */
  private static async resetFriendConversationLimits(conversation: Conversation): Promise<void> {
    if (
      conversation.clientMessageCount > 0 ||
      !conversation.providerHasResponded ||
      conversation.status === 'pending'
    ) {
      await conversation.update({
        clientMessageCount: 0,
        providerHasResponded: true,
        status: 'active',
      });
    }
  }
  
  /**
   * Get or create conversation between client and provider
   */
  static async getOrCreateConversation(
    clientId: string,
    providerId: string,
    options?: { isFriendChat?: boolean }
  ): Promise<Conversation> {
    try {
      const isFriendChat =
        options?.isFriendChat ??
        (await this.areUsersFriends(clientId, providerId));

      // Check if conversation already exists
      let conversation = await Conversation.findOne({
        where: {
          clientId,
          providerId,
        },
        include: [
          { model: User, as: 'client', attributes: [...CHAT_USER_ATTRIBUTES] },
          { model: User, as: 'provider', attributes: [...CHAT_USER_ATTRIBUTES] },
        ],
      });

      if (!conversation) {
        // Create new conversation
        conversation = await Conversation.create({
          clientId,
          providerId,
          status: isFriendChat ? 'active' : 'pending',
          clientMessageCount: 0,
          providerHasResponded: isFriendChat,
        });

        // Fetch with includes
        conversation = await Conversation.findByPk(conversation.id, {
          include: [
            { model: User, as: 'client', attributes: [...CHAT_USER_ATTRIBUTES] },
            { model: User, as: 'provider', attributes: [...CHAT_USER_ATTRIBUTES] },
          ],
        });
      } else if (isFriendChat) {
        await this.resetFriendConversationLimits(conversation);
        await conversation.reload({
          include: [
            { model: User, as: 'client', attributes: [...CHAT_USER_ATTRIBUTES] },
            { model: User, as: 'provider', attributes: [...CHAT_USER_ATTRIBUTES] },
          ],
        });
      }

      return conversation!;
    } catch (error) {
      console.error('Error getting/creating conversation:', error);
      throw new Error('Failed to create conversation');
    }
  }

  /**
   * Send a message in a conversation
   */
  static async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    messageType: 'text' | 'image' | 'reel' = 'text',
    attachments?: any
  ): Promise<{
    message: Message;
    canSend: boolean;
    reason?: string;
    messageLimitReached?: boolean;
    requiresSubscription?: boolean;
  }> {
    try {
      const conversation = await Conversation.findByPk(conversationId, {
        include: [
          { model: User, as: 'client' },
          { model: User, as: 'provider' },
        ],
      });

      if (!conversation) {
        return { message: null as any, canSend: false, reason: 'Conversation not found' };
      }

      const isClient = conversation.clientId === senderId;
      const isProvider = conversation.providerId === senderId;

      if (!isClient && !isProvider) {
        return { message: null as any, canSend: false, reason: 'Not authorized for this conversation' };
      }

      // Check message limits for clients
      if (isClient) {
        const canMessage = await this.canClientSendMessage(conversation, senderId);
        if (!canMessage.canSend) {
          return {
            message: null as any,
            canSend: false,
            reason: canMessage.reason,
            messageLimitReached: canMessage.messageLimitReached,
            requiresSubscription: canMessage.requiresSubscription,
          };
        }
      }

      // Create the message
      const message = await Message.create({
        conversationId,
        senderId,
        content,
        messageType,
        attachments,
        isRead: false,
      });

      // Update conversation
      const updateData: any = {
        lastMessageAt: new Date(),
      };

      if (isClient && !conversation.providerHasResponded) {
        updateData.clientMessageCount = conversation.clientMessageCount + 1;
      }

      if (isProvider && !conversation.providerHasResponded) {
        updateData.providerHasResponded = true;
        updateData.status = 'active';
      }

      await conversation.update(updateData);

      // Send notification to recipient
      const recipientId = isClient ? conversation.providerId : conversation.clientId;
      await NotificationService.createNotification({
        userId: recipientId,
        type: 'message',
        title: 'New Message',
        content: `You have a new message from ${isClient ? (conversation as any).client.name : (conversation as any).provider.name}`,
        data: {
          conversationId,
          messageId: message.id,
          senderId,
        },
      });

      // Fetch message with sender info
      const messageWithSender = await Message.findByPk(message.id, {
        include: [
          { model: User, as: 'sender', attributes: [...CHAT_USER_ATTRIBUTES] },
        ],
      });

      return { message: messageWithSender!, canSend: true };
    } catch (error) {
      console.error('Error sending message:', error);
      throw new Error('Failed to send message');
    }
  }

  /**
   * Get conversation messages with pagination
   */
  static async getConversationMessages(
    conversationId: string,
    userId: string,
    page: number = 1,
    limit: number = 50
  ) {
    try {
      // Verify user has access to this conversation
      const conversation = await Conversation.findOne({
        where: {
          id: conversationId,
          [Op.or]: [
            { clientId: userId },
            { providerId: userId },
          ],
        },
      });

      if (!conversation) {
        throw new Error('Conversation not found or access denied');
      }

      const offset = (page - 1) * limit;

      const { count, rows: messages } = await Message.findAndCountAll({
        where: { conversationId },
        include: [
          { model: User, as: 'sender', attributes: [...CHAT_USER_ATTRIBUTES] },
        ],
        order: [['createdAt', 'ASC']],
        limit,
        offset,
      });

      return {
        messages, // Already in correct order (oldest first)
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
      };
    } catch (error) {
      console.error('Error fetching messages:', error);
      throw error;
    }
  }

  /**
   * Get user's conversations
   */
  static async getUserConversations(userId: string, page: number = 1, limit: number = 20) {
    try {
      const offset = (page - 1) * limit;

      const { count, rows: conversations } = await Conversation.findAndCountAll({
        where: {
          [Op.or]: [
            { clientId: userId },
            { providerId: userId },
          ],
        },
        include: [
          { model: User, as: 'client', attributes: [...CHAT_USER_ATTRIBUTES] },
          { model: User, as: 'provider', attributes: [...CHAT_USER_ATTRIBUTES] },
          {
            model: Message,
            as: 'messages',
            limit: 1,
            order: [['createdAt', 'DESC']],
            include: [
              { model: User, as: 'sender', attributes: ['id', 'name'] },
            ],
          },
        ],
        order: [['lastMessageAt', 'DESC']],
        limit,
        offset,
      });

      return {
        conversations,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
      };
    } catch (error) {
      console.error('Error fetching conversations:', error);
      throw error;
    }
  }

  /**
   * Mark messages as read
   */
  static async markMessagesAsRead(conversationId: string, userId: string): Promise<void> {
    try {
      await Message.update(
        { isRead: true },
        {
          where: {
            conversationId,
            senderId: { [Op.ne]: userId }, // Mark messages from others as read
            isRead: false,
          },
        }
      );
    } catch (error) {
      console.error('Error marking messages as read:', error);
      throw error;
    }
  }

  /**
   * Check if client can send message (3-message rule)
   */
  private static async canClientSendMessage(
    conversation: Conversation,
    clientId: string
  ): Promise<{
    canSend: boolean;
    reason?: string;
    messageLimitReached?: boolean;
    requiresSubscription?: boolean;
  }> {
    try {
      const sender = await User.findByPk(clientId, { attributes: ['id', 'role'] });

      // Client subscription/limits only apply to users with the client role.
      // Providers in the clientId slot (friend chats, etc.) can always send.
      if (!sender || sender.role !== 'client') {
        return { canSend: true };
      }

      const areFriends = await this.areUsersFriends(clientId, conversation.providerId);

      if (areFriends) {
        await this.resetFriendConversationLimits(conversation);
        return { canSend: true };
      }

      // Not friends - apply normal client restrictions
      const messagingAccess = await SubscriptionService.canClientMessage(
        clientId,
        conversation.providerId
      );

      if (!messagingAccess.canMessage) {
        return {
          canSend: false,
          reason: messagingAccess.reason,
          requiresSubscription: messagingAccess.requiresSubscription ?? false,
        };
      }

      // Check 3-message rule
      if (!conversation.providerHasResponded && conversation.clientMessageCount >= 3) {
        return {
          canSend: false,
          messageLimitReached: true,
          reason: 'You can only send 3 messages until the provider responds',
        };
      }

      return { canSend: true };
    } catch (error) {
      console.error('Error checking message permissions:', error);
      return { canSend: false, reason: 'Error checking permissions' };
    }
  }

  /**
   * Get unread message count for user
   */
  static async getUnreadMessageCount(userId: string): Promise<number> {
    try {
      const count = await Message.count({
        include: [
          {
            model: Conversation,
            as: 'conversation',
            where: {
              [Op.or]: [
                { clientId: userId },
                { providerId: userId },
              ],
            },
          },
        ],
        where: {
          senderId: { [Op.ne]: userId },
          isRead: false,
        },
      });

      return count;
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }

  /**
   * Block/unblock conversation
   */
  static async updateConversationStatus(
    conversationId: string,
    userId: string,
    status: 'active' | 'blocked'
  ): Promise<void> {
    try {
      const conversation = await Conversation.findOne({
        where: {
          id: conversationId,
          [Op.or]: [
            { clientId: userId },
            { providerId: userId },
          ],
        },
      });

      if (!conversation) {
        throw new Error('Conversation not found or access denied');
      }

      await conversation.update({ status });
    } catch (error) {
      console.error('Error updating conversation status:', error);
      throw error;
    }
  }
}
