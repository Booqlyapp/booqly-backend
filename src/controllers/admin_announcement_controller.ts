import { Request, Response } from "express";
import { AnnouncementService } from "../services/announcement.service";

interface AuthRequest extends Request {
  user?: any;
  userId?: string;
}

export const getAnnouncementStats = async (
  _req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const data = await AnnouncementService.getStats();
    res.status(200).json({
      status: true,
      message: "Announcement stats retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Error fetching announcement stats:", error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Failed to fetch announcement stats",
    });
  }
};

export const listAnnouncements = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const data = await AnnouncementService.list({
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      status: req.query.status as any,
      type: req.query.type as any,
      audience: req.query.audience as any,
      search: req.query.search as string | undefined,
    });

    res.status(200).json({
      status: true,
      message: "Announcements retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Error listing announcements:", error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Failed to list announcements",
    });
  }
};

export const getAnnouncementById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const data = await AnnouncementService.getById(req.params.id);
    res.status(200).json({
      status: true,
      message: "Announcement retrieved successfully",
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch announcement";
    res.status(message === "Announcement not found" ? 404 : 500).json({
      status: false,
      message,
    });
  }
};

export const createAnnouncement = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }

    const data = await AnnouncementService.create({
      ...req.body,
      createdById: req.userId,
    });

    res.status(201).json({
      status: true,
      message: "Announcement created successfully",
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create announcement";
    const statusCode =
      message.includes("required") || message.includes("must be") ? 400 : 500;
    res.status(statusCode).json({ status: false, message });
  }
};

export const updateAnnouncement = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const data = await AnnouncementService.update(req.params.id, req.body);
    res.status(200).json({
      status: true,
      message: "Announcement updated successfully",
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update announcement";
    const statusCode =
      message === "Announcement not found"
        ? 404
        : message.includes("required") || message.includes("must be")
          ? 400
          : 500;
    res.status(statusCode).json({ status: false, message });
  }
};

export const publishAnnouncement = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const data = await AnnouncementService.publish(req.params.id);
    res.status(200).json({
      status: true,
      message: "Announcement published successfully",
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to publish announcement";
    const statusCode =
      message === "Announcement not found"
        ? 404
        : message.includes("Cannot")
          ? 400
          : 500;
    res.status(statusCode).json({ status: false, message });
  }
};

export const scheduleAnnouncement = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const data = await AnnouncementService.schedule(req.params.id, req.body.scheduledAt);
    res.status(200).json({
      status: true,
      message: "Announcement scheduled successfully",
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to schedule announcement";
    const statusCode =
      message === "Announcement not found"
        ? 404
        : message.includes("must be") || message.includes("Invalid")
          ? 400
          : 500;
    res.status(statusCode).json({ status: false, message });
  }
};

export const unpublishAnnouncement = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const data = await AnnouncementService.unpublish(req.params.id);
    res.status(200).json({
      status: true,
      message: "Announcement moved to drafts",
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to unpublish announcement";
    res.status(message === "Announcement not found" ? 404 : 500).json({
      status: false,
      message,
    });
  }
};

export const deleteAnnouncement = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const data = await AnnouncementService.remove(req.params.id);
    res.status(200).json({
      status: true,
      message: "Announcement deleted successfully",
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete announcement";
    res.status(message === "Announcement not found" ? 404 : 500).json({
      status: false,
      message,
    });
  }
};
