import { Request, Response } from "express";
import { ContentReportService } from "../services/content_report.service";

interface AuthRequest extends Request {
  user?: any;
  userId?: string;
}

export const createContentReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }

    const report = await ContentReportService.createReport({
      reporterId: req.userId,
      reportedUserId: req.body.reportedUserId,
      contentType: req.body.contentType,
      contentId: String(req.body.contentId),
      reason: req.body.reason,
      details: req.body.details,
      originalUserId: req.body.originalUserId,
      contentPreview: req.body.contentPreview,
      contentThumbnailUrl: req.body.contentThumbnailUrl,
    });

    res.status(201).json({
      status: true,
      message: "Report submitted. Our team will review it shortly.",
      data: { id: report.id, status: report.status },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit report";
    const statusCode =
      message.includes("already reported") ||
      message.includes("cannot report") ||
      message.includes("not found")
        ? 400
        : 500;
    res.status(statusCode).json({ status: false, message });
  }
};

export const listContentReports = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await ContentReportService.listReports({
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      contentType: req.query.contentType as any,
      reason: req.query.reason as any,
      status: (req.query.status as any) || "pending",
      search: req.query.search as string | undefined,
    });

    res.status(200).json({
      status: true,
      message: "Content reports retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Error listing content reports:", error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Failed to list content reports",
    });
  }
};

export const getContentReportById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = await ContentReportService.getReportById(req.params.id);
    res.status(200).json({
      status: true,
      message: "Content report retrieved successfully",
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch report";
    res.status(message === "Report not found" ? 404 : 500).json({ status: false, message });
  }
};

export const resolveContentReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ status: false, message: "Authentication required" });
      return;
    }

    const data = await ContentReportService.resolveReport(
      req.params.id,
      req.userId,
      req.body.action,
      req.body.adminNote
    );

    res.status(200).json({
      status: true,
      message: "Report resolved successfully",
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve report";
    const statusCode =
      message === "Report not found" ? 404 : message.includes("already been resolved") ? 400 : 500;
    res.status(statusCode).json({ status: false, message });
  }
};
