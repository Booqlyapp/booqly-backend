import { Op, QueryTypes } from "sequelize";
import sequelize from "../config/database";
import {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from "../models/support_ticket_model";
import { SupportTicketMessage } from "../models/support_ticket_message_model";
import { User } from "../models/user_model";

const USER_ATTRS = ["id", "name", "email", "role", "profilePic", "businessName", "isTeamMember"];

const CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  billing: "Billing",
  app_issue: "App Issue",
  verification: "Verification",
  account: "Account",
  payment: "Payment",
};

const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const PRIORITY_LABELS: Record<SupportTicketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export interface CreateSupportTicketInput {
  userId: string;
  createdById: string;
  category: SupportTicketCategory;
  subject: string;
  description: string;
  priority?: SupportTicketPriority;
  assignedToId?: string | null;
  attachments?: string[] | null;
  status?: SupportTicketStatus;
}

export interface UpdateSupportTicketInput {
  category?: SupportTicketCategory;
  subject?: string;
  description?: string;
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  assignedToId?: string | null;
  attachments?: string[] | null;
}

export class SupportTicketService {
  static async getStats() {
    const now = new Date();
    const last7Start = new Date(now);
    last7Start.setDate(last7Start.getDate() - 7);
    const prev7Start = new Date(now);
    prev7Start.setDate(prev7Start.getDate() - 14);

    const [
      total,
      open,
      inProgress,
      resolved,
      totalLast7,
      totalPrev7,
      openLast7,
      openPrev7,
      inProgressLast7,
      inProgressPrev7,
      resolvedLast7,
      resolvedPrev7,
      avgResponseHours,
      avgResponseHoursPrev,
    ] = await Promise.all([
      SupportTicket.count(),
      SupportTicket.count({ where: { status: "open" } }),
      SupportTicket.count({ where: { status: "in_progress" } }),
      SupportTicket.count({ where: { status: "resolved" } }),
      SupportTicket.count({ where: { createdAt: { [Op.gte]: last7Start } } }),
      SupportTicket.count({
        where: { createdAt: { [Op.gte]: prev7Start, [Op.lt]: last7Start } },
      }),
      SupportTicket.count({
        where: { status: "open", createdAt: { [Op.gte]: last7Start } },
      }),
      SupportTicket.count({
        where: {
          status: "open",
          createdAt: { [Op.gte]: prev7Start, [Op.lt]: last7Start },
        },
      }),
      SupportTicket.count({
        where: { status: "in_progress", createdAt: { [Op.gte]: last7Start } },
      }),
      SupportTicket.count({
        where: {
          status: "in_progress",
          createdAt: { [Op.gte]: prev7Start, [Op.lt]: last7Start },
        },
      }),
      SupportTicket.count({
        where: {
          status: "resolved",
          resolvedAt: { [Op.gte]: last7Start },
        },
      }),
      SupportTicket.count({
        where: {
          resolvedAt: { [Op.gte]: prev7Start, [Op.lt]: last7Start },
        },
      }),
      this.getAverageResponseHours(last7Start, now),
      this.getAverageResponseHours(prev7Start, last7Start),
    ]);

    return {
      totalTickets: {
        count: total,
        percentChange: this.percentChange(totalLast7, totalPrev7),
      },
      openTickets: {
        count: open,
        percentChange: this.percentChange(openLast7, openPrev7),
      },
      inProgress: {
        count: inProgress,
        percentChange: this.percentChange(inProgressLast7, inProgressPrev7),
      },
      resolved: {
        count: resolved,
        percentChange: this.percentChange(resolvedLast7, resolvedPrev7),
      },
      avgResponseTime: {
        hours: avgResponseHours,
        percentChange: this.percentChange(avgResponseHours, avgResponseHoursPrev),
      },
      period: "last_7_days",
    };
  }

  static async list(filters: {
    page?: number;
    limit?: number;
    status?: SupportTicketStatus | "all";
    category?: SupportTicketCategory;
    priority?: SupportTicketPriority;
    search?: string;
    assignedToId?: string;
    userId?: string;
  }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const offset = (page - 1) * limit;

    const where: any = {};
    if (filters.status && filters.status !== "all") {
      where.status = filters.status;
    }
    if (filters.category) where.category = filters.category;
    if (filters.priority) where.priority = filters.priority;
    if (filters.assignedToId) where.assignedToId = filters.assignedToId;
    if (filters.userId) where.userId = filters.userId;

    if (filters.search) {
      const term = `%${filters.search}%`;
      where[Op.or] = [
        { ticketNumber: { [Op.iLike]: term } },
        { subject: { [Op.iLike]: term } },
        { description: { [Op.iLike]: term } },
      ];
    }

    const { count, rows } = await SupportTicket.findAndCountAll({
      where,
      include: [
        { model: User, as: "user", attributes: USER_ATTRS },
        { model: User, as: "assignedTo", attributes: USER_ATTRS, required: false },
        { model: User, as: "createdBy", attributes: USER_ATTRS, required: false },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return {
      tickets: rows.map((row) => this.serializeTicket(row)),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit) || 1,
        totalItems: count,
        itemsPerPage: limit,
      },
    };
  }

  static async getById(id: string, options?: { includeInternal?: boolean; requesterId?: string }) {
    const ticket = await SupportTicket.findByPk(id, {
      include: [
        { model: User, as: "user", attributes: USER_ATTRS },
        { model: User, as: "assignedTo", attributes: USER_ATTRS, required: false },
        { model: User, as: "createdBy", attributes: USER_ATTRS, required: false },
      ],
    });
    if (!ticket) {
      throw new Error("Support ticket not found");
    }

    if (options?.requesterId && ticket.userId !== options.requesterId) {
      const requester = await User.findByPk(options.requesterId);
      if (!requester || requester.role !== "admin") {
        throw new Error("Access denied");
      }
    }

    const messageWhere: any = { ticketId: ticket.id };
    if (!options?.includeInternal) {
      messageWhere.isInternal = false;
    }

    const messages = await SupportTicketMessage.findAll({
      where: messageWhere,
      include: [{ model: User, as: "sender", attributes: USER_ATTRS }],
      order: [["createdAt", "ASC"]],
    });

    return {
      ...this.serializeTicket(ticket),
      messages: messages.map((msg) => this.serializeMessage(msg)),
    };
  }

  static async create(input: CreateSupportTicketInput) {
    const user = await User.findByPk(input.userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (input.assignedToId) {
      const assignee = await User.findByPk(input.assignedToId);
      if (!assignee || assignee.role !== "admin") {
        throw new Error("Assignee must be an admin user");
      }
    }

    const ticketNumber = await this.nextTicketNumber();
    const status = input.status || "open";
    const now = new Date();
    const assignedToId = input.assignedToId?.trim() || null;

    const ticket = await SupportTicket.create({
      ticketNumber,
      userId: input.userId,
      createdById: input.createdById,
      category: input.category,
      subject: input.subject.trim().slice(0, 100),
      description: input.description.trim().slice(0, 1000),
      status,
      priority: input.priority || "medium",
      assignedToId,
      attachments: input.attachments || [],
      firstResponseAt: null,
      resolvedAt: status === "resolved" ? now : null,
      closedAt: status === "closed" ? now : null,
    });

    await SupportTicketMessage.create({
      ticketId: ticket.id,
      senderId: input.createdById,
      message: input.description.trim().slice(0, 1000),
      attachments: input.attachments || [],
      isInternal: false,
    });

    return this.getById(ticket.id, { includeInternal: true });
  }

  static async update(id: string, input: UpdateSupportTicketInput) {
    const ticket = await SupportTicket.findByPk(id);
    if (!ticket) {
      throw new Error("Support ticket not found");
    }

    if (input.assignedToId) {
      const assignee = await User.findByPk(input.assignedToId);
      if (!assignee || assignee.role !== "admin") {
        throw new Error("Assignee must be an admin user");
      }
    }

    const updates: Partial<SupportTicket> = {};
    if (input.category !== undefined) updates.category = input.category;
    if (input.subject !== undefined) updates.subject = input.subject.trim().slice(0, 100);
    if (input.description !== undefined) {
      updates.description = input.description.trim().slice(0, 1000);
    }
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.assignedToId !== undefined) {
      updates.assignedToId = input.assignedToId?.trim() || null;
    }
    if (input.attachments !== undefined) updates.attachments = input.attachments;

    if (input.status !== undefined && input.status !== ticket.status) {
      updates.status = input.status;
      const now = new Date();
      if (input.status === "resolved") {
        updates.resolvedAt = now;
        updates.closedAt = null;
      } else if (input.status === "closed") {
        updates.closedAt = now;
        if (!ticket.resolvedAt) updates.resolvedAt = now;
      } else if (input.status === "open" || input.status === "in_progress") {
        updates.resolvedAt = null;
        updates.closedAt = null;
      }
    }

    await ticket.update(updates);
    return this.getById(id, { includeInternal: true });
  }

  static async addMessage(input: {
    ticketId: string;
    senderId: string;
    message: string;
    attachments?: string[] | null;
    isInternal?: boolean;
    isAdmin?: boolean;
  }) {
    const ticket = await SupportTicket.findByPk(input.ticketId);
    if (!ticket) {
      throw new Error("Support ticket not found");
    }

    if (!input.isAdmin && ticket.userId !== input.senderId) {
      throw new Error("Access denied");
    }

    if (ticket.status === "closed") {
      throw new Error("Cannot reply to a closed ticket");
    }

    const message = await SupportTicketMessage.create({
      ticketId: ticket.id,
      senderId: input.senderId,
      message: input.message.trim(),
      attachments: input.attachments || [],
      isInternal: input.isAdmin ? !!input.isInternal : false,
    });

    const sender = await User.findByPk(input.senderId);
    const updates: Partial<SupportTicket> = {};

    if (sender?.role === "admin" && !ticket.firstResponseAt && !input.isInternal) {
      updates.firstResponseAt = new Date();
    }

    if (sender?.role === "admin" && ticket.status === "open" && !input.isInternal) {
      updates.status = "in_progress";
    }

    if (Object.keys(updates).length > 0) {
      await ticket.update(updates);
    }

    return this.getById(ticket.id, {
      includeInternal: !!input.isAdmin,
      requesterId: input.senderId,
    });
  }

  static async listAssignees() {
    const admins = await User.findAll({
      where: { role: "admin" },
      attributes: USER_ATTRS,
      order: [["name", "ASC"]],
    });

    return admins.map((admin) => this.serializeUser(admin));
  }

  private static async nextTicketNumber(): Promise<string> {
    const [row] = await sequelize.query<{ max: string | null }>(
      `SELECT MAX(
         CASE
           WHEN "ticketNumber" ~ '^TK-[0-9]+$'
           THEN CAST(SUBSTRING("ticketNumber" FROM 4) AS INTEGER)
           ELSE 0
         END
       ) AS max
       FROM "SupportTickets"`,
      { type: QueryTypes.SELECT }
    );

    const next = (parseInt(row?.max || "0", 10) || 0) + 1;
    return `TK-${String(next).padStart(4, "0")}`;
  }

  private static async getAverageResponseHours(start: Date, end: Date): Promise<number> {
    const [row] = await sequelize.query<{ avgHours: string | null }>(
      `SELECT AVG(
         EXTRACT(EPOCH FROM ("firstResponseAt" - "createdAt")) / 3600.0
       ) AS "avgHours"
       FROM "SupportTickets"
       WHERE "firstResponseAt" IS NOT NULL
         AND "firstResponseAt" BETWEEN :start AND :end`,
      {
        replacements: { start, end },
        type: QueryTypes.SELECT,
      }
    );

    const value = parseFloat(row?.avgHours || "0");
    return Math.round(value * 10) / 10;
  }

  private static percentChange(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return Math.round((((current - previous) / previous) * 100) * 10) / 10;
  }

  private static roleLabel(user: User): string {
    if (user.role === "client") return "Client";
    if (user.role === "solo") return "Solo Pro";
    if (user.role === "suite") {
      return user.isTeamMember ? "Suite Pro" : "Suite Owner";
    }
    if (user.role === "admin") return "Admin";
    return user.role;
  }

  private static serializeUser(user: User | null | undefined) {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      roleLabel: this.roleLabel(user),
      profilePic: user.profilePic,
      businessName: user.businessName,
    };
  }

  private static serializeTicket(ticket: SupportTicket) {
    const user = (ticket as any).user as User | undefined;
    const assignedTo = (ticket as any).assignedTo as User | undefined;
    const createdBy = (ticket as any).createdBy as User | undefined;

    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      displayId: `#${ticket.ticketNumber}`,
      category: ticket.category,
      categoryLabel: CATEGORY_LABELS[ticket.category],
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      statusLabel: STATUS_LABELS[ticket.status],
      priority: ticket.priority,
      priorityLabel: PRIORITY_LABELS[ticket.priority],
      attachments: ticket.attachments || [],
      firstResponseAt: ticket.firstResponseAt,
      resolvedAt: ticket.resolvedAt,
      closedAt: ticket.closedAt,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      user: this.serializeUser(user),
      assignedTo: this.serializeUser(assignedTo),
      createdBy: this.serializeUser(createdBy),
    };
  }

  private static serializeMessage(message: SupportTicketMessage) {
    const sender = (message as any).sender as User | undefined;
    return {
      id: message.id,
      ticketId: message.ticketId,
      message: message.message,
      attachments: message.attachments || [],
      isInternal: message.isInternal,
      createdAt: message.createdAt,
      sender: this.serializeUser(sender),
    };
  }
}
