import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { User } from '../models/user_model';
import { ChatService } from './chat.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: User;
}

export class SocketService {
  private io: SocketIOServer;
  private connectedUsers: Map<string, string> = new Map(); // userId -> socketId

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket: any, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY!) as any;
        const user = await User.findByPk(decoded.id);
        
        if (!user) {
          return next(new Error('User not found'));
        }

        socket.userId = user.id;
        socket.user = user;
        next();
      } catch (error) {
        next(new Error('Invalid token'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`User ${socket.userId} connected`);
      
      // Store user connection
      if (socket.userId) {
        this.connectedUsers.set(socket.userId, socket.id);
        
        // Join user to their personal room
        socket.join(`user:${socket.userId}`);
      }

      // Handle joining conversation rooms
      socket.on('join_conversation', (conversationId: string) => {
        socket.join(`conversation:${conversationId}`);
        console.log(`User ${socket.userId} joined conversation ${conversationId}`);
      });

      // Handle leaving conversation rooms
      socket.on('leave_conversation', (conversationId: string) => {
        socket.leave(`conversation:${conversationId}`);
        console.log(`User ${socket.userId} left conversation ${conversationId}`);
      });

      // Handle sending messages
      socket.on('send_message', async (data: {
        conversationId: string;
        content: string;
        messageType?: 'text' | 'image' | 'reel' | 'video' | 'voice';
        attachments?: any;
      }) => {
        try {
          if (!socket.userId) return;

          const result = await ChatService.sendMessage(
            data.conversationId,
            socket.userId,
            data.content,
            data.messageType || 'text',
            data.attachments
          );

          if (result.canSend) {
            // Emit message to conversation room
            this.io.to(`conversation:${data.conversationId}`).emit('new_message', {
              message: result.message,
              conversationId: data.conversationId,
            });

            // Send acknowledgment to sender
            socket.emit('message_sent', {
              success: true,
              message: result.message,
            });
          } else {
            // Send error to sender
            socket.emit('message_error', {
              error: result.reason,
            });
          }
        } catch (error) {
          console.error('Socket message error:', error);
          socket.emit('message_error', {
            error: 'Failed to send message',
          });
        }
      });

      // Handle typing indicators
      socket.on('typing_start', (data: { conversationId: string }) => {
        socket.to(`conversation:${data.conversationId}`).emit('user_typing', {
          userId: socket.userId,
          conversationId: data.conversationId,
        });
      });

      socket.on('typing_stop', (data: { conversationId: string }) => {
        socket.to(`conversation:${data.conversationId}`).emit('user_stopped_typing', {
          userId: socket.userId,
          conversationId: data.conversationId,
        });
      });

      // Handle marking messages as read
      socket.on('mark_messages_read', async (data: { conversationId: string }) => {
        try {
          if (!socket.userId) return;

          await ChatService.markMessagesAsRead(data.conversationId, socket.userId);
          
          // Notify other participants that messages were read
          socket.to(`conversation:${data.conversationId}`).emit('messages_read', {
            userId: socket.userId,
            conversationId: data.conversationId,
          });
        } catch (error) {
          console.error('Socket mark read error:', error);
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`User ${socket.userId} disconnected`);
        
        if (socket.userId) {
          this.connectedUsers.delete(socket.userId);
        }
      });
    });
  }

  /**
   * Send notification to a specific user
   */
  public sendNotificationToUser(userId: string, notification: any) {
    this.io.to(`user:${userId}`).emit('notification', notification);
  }

  /**
   * Send message to conversation
   */
  public sendMessageToConversation(conversationId: string, message: any) {
    this.io.to(`conversation:${conversationId}`).emit('new_message', message);
  }

  /**
   * Check if user is online
   */
  public isUserOnline(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }

  /**
   * Get online users count
   */
  public getOnlineUsersCount(): number {
    return this.connectedUsers.size;
  }

  /**
   * Broadcast to all connected users
   */
  public broadcastToAll(event: string, data: any) {
    this.io.emit(event, data);
  }

  /**
   * Send to specific socket
   */
  public sendToSocket(socketId: string, event: string, data: any) {
    this.io.to(socketId).emit(event, data);
  }

  /**
   * Get Socket.IO instance
   */
  public getIO(): SocketIOServer {
    return this.io;
  }
}
