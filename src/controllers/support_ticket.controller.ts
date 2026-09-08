import path from "path";
import { Request, Response } from "express";
import { SupportTicketService } from "../services/support_ticket.service";
import { localFileStorage } from "../utils/local-storage";

interface AuthRequest extends Request {
  user?: any;
  userId?: string;
  file?: Express.Multer.File;
}

export const getSupportStats = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await SupportTicketService.getStats();
    res.status(200).json({
      status: true,
      message: "Support stats retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Error fetching support stats:", error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Failed to fetch support stats",
    });
  }
};

export const listSupportTicketsAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await SupportTicketService.list({
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      status: req.query.status as any,
      category: req.query.category as any,
      priority: req.query.priority as any,
      search: req.query.search as string | undefined,
      assignedToId: req.query.assignedToId as string | undefined,
      userId: req.query.userId as string | undefined,
    });

    res.status(200).json({
      status: true,
      message: "Support tickets retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Error listing support tickets:", error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Failed to list support tickets",
    });
  }
};

export const getSupportTicketAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await SupportTicketService.getById(req.params.id, {
      includeInternal: true,
    });
    res.status(200).json({
      status: true,
      message: "Support ticket retrieved successfully",
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch support ticket";
    res.status(message === "Support ticket not found" ? 404 : 500).json({
      status: false,
      message,
    });
  }
};

export const createSupportTicketAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }

    const data = await SupportTicketService.create({
      userId: req.body.userId,
      createdById: req.userId,
      category: req.body.category,
      subject: req.body.subject,
      description: req.body.description,
      priority: req.body.priority,
      assignedToId: req.body.assignedToId,
      attachments: req.body.attachments,
      status: req.body.status || "open",
    });

    res.status(201).json({
      status: true,
      message: "Support ticket created successfully",
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create support ticket";
    const statusCode =
      message.includes("not found") || message.includes("must be") ? 400 : 500;
    res.status(statusCode).json({ status: false, message });
  }
};

export const updateSupportTicketAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await SupportTicketService.update(req.params.id, req.body);
    res.status(200).json({
      status: true,
      message: "Support ticket updated successfully",
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update support ticket";
    const statusCode =
      message === "Support ticket not found"
        ? 404
        : message.includes("must be")
          ? 400
          : 500;
    res.status(statusCode).json({ status: false, message });
  }
};

export const addSupportTicketMessageAdmin = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }

    const data = await SupportTicketService.addMessage({
      ticketId: req.params.id,
      senderId: req.userId,
      message: req.body.message,
      attachments: req.body.attachments,
      isInternal: req.body.isInternal,
      isAdmin: true,
    });

    res.status(201).json({
      status: true,
      message: "Reply added successfully",
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add reply";
    const statusCode =
      message === "Support ticket not found"
        ? 404
        : message.includes("Cannot") || message.includes("Access")
          ? 400
          : 500;
    res.status(statusCode).json({ status: false, message });
  }
};

export const listSupportAssignees = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await SupportTicketService.listAssignees();
    res.status(200).json({
      status: true,
      message: "Assignees retrieved successfully",
      data,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Failed to list assignees",
    });
  }
};

export const createSupportTicketUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }

    const data = await SupportTicketService.create({
      userId: req.userId,
      createdById: req.userId,
      category: req.body.category,
      subject: req.body.subject,
      description: req.body.description,
      priority: req.body.priority || "medium",
      attachments: req.body.attachments,
      status: "open",
    });

    res.status(201).json({
      status: true,
      message: "Support ticket submitted successfully",
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create support ticket";
    res.status(message.includes("not found") ? 400 : 500).json({ status: false, message });
  }
};

export const listMySupportTickets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }

    const data = await SupportTicketService.list({
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      status: req.query.status as any,
      category: req.query.category as any,
      search: req.query.search as string | undefined,
      userId: req.userId,
    });

    res.status(200).json({
      status: true,
      message: "Your support tickets retrieved successfully",
      data,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Failed to list your tickets",
    });
  }
};

export const getMySupportTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }

    const data = await SupportTicketService.getById(req.params.id, {
      includeInternal: false,
      requesterId: req.userId,
    });

    res.status(200).json({
      status: true,
      message: "Support ticket retrieved successfully",
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch support ticket";
    const statusCode =
      message === "Support ticket not found"
        ? 404
        : message === "Access denied"
          ? 403
          : 500;
    res.status(statusCode).json({ status: false, message });
  }
};

export const addMySupportTicketMessage = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }

    const data = await SupportTicketService.addMessage({
      ticketId: req.params.id,
      senderId: req.userId,
      message: req.body.message,
      attachments: req.body.attachments,
      isAdmin: false,
    });

    res.status(201).json({
      status: true,
      message: "Reply added successfully",
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add reply";
    const statusCode =
      message === "Support ticket not found"
        ? 404
        : message === "Access denied" || message.includes("Cannot")
          ? 403
          : 500;
    res.status(statusCode).json({ status: false, message });
  }
};

export const uploadSupportAttachment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ status: false, message: "No file provided" });
      return;
    }

    const relativePath = path
      .join("support-attachments", req.file.filename)
      .replace(/\\/g, "/");
    const url = localFileStorage.getPublicUrl(relativePath);

    res.status(200).json({
      status: true,
      message: "Attachment uploaded successfully",
      data: {
        url,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Failed to upload attachment",
    });
  }
};
