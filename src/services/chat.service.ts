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

      // Friend chats can be opened from either side; normalize IDs so one pair
      // always maps to one conversation and look up both orientations.
      let resolvedClientId = clientId;
      let resolvedProviderId = providerId;
      if (isFriendChat) {
        const sorted = [clientId, providerId].sort();
        resolvedClientId = sorted[0];
        resolvedProviderId = sorted[1];
      }

      const includeUsers = [
        { model: User, as: 'client', attributes: [...CHAT_USER_ATTRIBUTES] },
        { model: User, as: 'provider', attributes: [...CHAT_USER_ATTRIBUTES] },
      ];

      // Check if conversation already exists in either orientation (prevents duals).
      let conversation = await Conversation.findOne({
        where: {
          [Op.or]: [
            { clientId: resolvedClientId, providerId: resolvedProviderId },
            { clientId: resolvedProviderId, providerId: resolvedClientId },
            { clientId, providerId },
            { clientId: providerId, providerId: clientId },
          ],
        },
        include: includeUsers,
      });

      if (!conversation) {
        conversation = await Conversation.create({
          clientId: resolvedClientId,
          providerId: resolvedProviderId,
          status: isFriendChat ? 'active' : 'pending',
          clientMessageCount: 0,
          providerHasResponded: isFriendChat,
        });

        conversation = await Conversation.findByPk(conversation.id, {
          include: includeUsers,
        });
      } else if (isFriendChat) {
        await this.resetFriendConversationLimits(conversation);
        await conversation.reload({ include: includeUsers });
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
    messageType: 'text' | 'image' | 'reel' | 'video' | 'voice' = 'text',
    attachments?: any
  ): Promise<{
    message: Message;
    canSend: boolean;
    reason?: string;
    messageLimitReached?: boolean;
    requiresSubscription?: boolean;
    recipientId?: string;
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

      // Push to the other participant (WhatsApp-style: sender name + preview).
      const recipientId = isClient ? conversation.providerId : conversation.clientId;
      const senderUser = isClient
        ? (conversation as any).client
        : (conversation as any).provider;
      const senderName =
        (senderUser?.name && String(senderUser.name).trim()) || 'Someone';

      let preview = '';
      if (messageType === 'text') {
        preview = (content || '').trim();
      } else if (messageType === 'image') {
        preview = '📷 Photo';
      } else if (messageType === 'video') {
        preview = '🎥 Video';
      } else if (messageType === 'voice') {
        preview = '🎤 Voice message';
      } else if (messageType === 'reel') {
        preview = '🎬 Reel';
      } else {
        preview = 'New message';
      }
      if (preview.length > 120) {
        preview = `${preview.slice(0, 117)}...`;
      }
      if (!preview) {
        preview = 'New message';
      }

      // Never let push/in-app notification failures block message delivery.
      try {
        await NotificationService.createNotification({
          userId: recipientId,
          type: 'message',
          title: senderName,
          content: preview,
          data: {
            type: 'message',
            conversationId,
            messageId: message.id,
            senderId,
            senderName,
            clientId: conversation.clientId,
            providerId: conversation.providerId,
          },
          channels: {
            push: true,
            sms: false,
            email: false,
            in_app: true,
          },
        });
      } catch (notifyError) {
        console.error('Chat push/in-app notification failed:', notifyError);
      }

      // Fetch message with sender info
      const messageWithSender = await Message.findByPk(message.id, {
        include: [
          { model: User, as: 'sender', attributes: [...CHAT_USER_ATTRIBUTES] },
        ],
      });

      return {
        message: messageWithSender!,
        canSend: true,
        recipientId,
      };
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
        const accessError: any = new Error('Conversation not found or access denied');
        accessError.statusCode = 403;
        throw accessError;
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
        distinct: true,
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

      // Fetch a wider window then de-dupe swapped client/provider pairs so
      // the same two users never appear as two chat threads.
      const rows = await Conversation.findAll({
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
            limit: 20,
            separate: true,
            order: [['createdAt', 'DESC']],
            include: [
              { model: User, as: 'sender', attributes: ['id', 'name'] },
            ],
          },
        ],
        order: [
          ['lastMessageAt', 'DESC'],
          ['updatedAt', 'DESC'],
        ],
      });

      const pairKey = (c: Conversation) =>
        [c.clientId, c.providerId].sort().join(':');

      const dedupedMap = new Map<string, Conversation>();
      for (const conversation of rows) {
        const key = pairKey(conversation);
        const existing = dedupedMap.get(key);
        if (!existing) {
          dedupedMap.set(key, conversation);
          continue;
        }
        const existingTime = existing.lastMessageAt?.getTime() ?? 0;
        const nextTime = conversation.lastMessageAt?.getTime() ?? 0;
        if (nextTime >= existingTime) {
          dedupedMap.set(key, conversation);
        }
      }

      const deduped = Array.from(dedupedMap.values()).sort((a, b) => {
        const aTime = a.lastMessageAt?.getTime() ?? 0;
        const bTime = b.lastMessageAt?.getTime() ?? 0;
        return bTime - aTime;
      });

      // Keep latest message for preview + recent unread for accurate badges.
      for (const conversation of deduped) {
        const msgs = (conversation as any).messages as Message[] | undefined;
        if (!msgs || msgs.length === 0) continue;
        const latest = msgs[0];
        const unreadOthers = msgs.filter(
          (m) => !m.isRead && m.senderId !== userId && m.id !== latest.id
        );
        (conversation as any).messages = [latest, ...unreadOthers];
      }

      const total = deduped.length;
      const conversations = deduped.slice(offset, offset + limit);

      return {
        conversations,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
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
      // Avoid fragile Message.count({ include }) which can return 0 / throw
      // depending on dialect — resolve conversation IDs first, then count.
      const conversations = await Conversation.findAll({
        where: {
          [Op.or]: [{ clientId: userId }, { providerId: userId }],
        },
        attributes: ['id'],
      });

      const conversationIds = conversations.map((c) => c.id);
      if (conversationIds.length === 0) return 0;

      return Message.count({
        where: {
          conversationId: { [Op.in]: conversationIds },
          senderId: { [Op.ne]: userId },
          isRead: false,
        },
      });
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
