import { Op } from "sequelize";
import { ContentReport, ContentReportReason, ContentReportStatus, ContentReportType } from "../models/content_report_model";
import { User } from "../models/user_model";
import { Message } from "../models/message_model";
import { Service } from "../models/service_model";
import { Marketplace } from "../models/marketplace_model";
import { NotificationService } from "./notification.service";

const USER_PUBLIC_ATTRS = ["id", "name", "email", "role", "profilePic", "businessName", "isSuspended", "warningCount"];

export interface CreateContentReportInput {
  reporterId: string;
  reportedUserId: string;
  contentType: ContentReportType;
  contentId: string;
  reason: ContentReportReason;
  details?: string | null;
  originalUserId?: string | null;
  contentPreview?: string | null;
  contentThumbnailUrl?: string | null;
}

export class ContentReportService {
  static async createReport(input: CreateContentReportInput) {
    if (input.reporterId === input.reportedUserId) {
      throw new Error("You cannot report your own content");
    }

    const originalUserId = input.originalUserId?.trim() || null;

    const reportedUser = await User.findByPk(input.reportedUserId);
    if (!reportedUser) {
      throw new Error("Reported user not found");
    }

    if (originalUserId) {
      const original = await User.findByPk(originalUserId);
      if (!original) {
        throw new Error("Original account not found");
      }
    }

    const existing = await ContentReport.findOne({
      where: {
        reporterId: input.reporterId,
        contentType: input.contentType,
        contentId: input.contentId,
        status: "pending",
      },
    });
    if (existing) {
      throw new Error("You have already reported this content");
    }

    const snapshot = await this.buildContentSnapshot(input);

    return ContentReport.create({
      reporterId: input.reporterId,
      reportedUserId: input.reportedUserId,
      originalUserId: originalUserId,
      contentType: input.contentType,
      contentId: input.contentId,
      reason: input.reason,
      details: input.details || null,
      contentPreview: snapshot.contentPreview,
      contentThumbnailUrl: snapshot.contentThumbnailUrl,
      status: "pending",
      adminNote: null,
      resolvedById: null,
      resolvedAt: null,
    });
  }

  static async listReports(filters: {
    page?: number;
    limit?: number;
    contentType?: ContentReportType | "all";
    reason?: ContentReportReason;
    status?: ContentReportStatus | "all";
    search?: string;
  }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const offset = (page - 1) * limit;

    const where: any = {};
    if (filters.contentType && filters.contentType !== "all") {
      where.contentType = filters.contentType;
    }
    if (filters.reason) {
      where.reason = filters.reason;
    }
    if (filters.status && filters.status !== "all") {
      where.status = filters.status;
    } else if (!filters.status) {
      where.status = "pending";
    }

    const reporterInclude: any = {
      model: User,
      as: "reporter",
      attributes: USER_PUBLIC_ATTRS,
    };
    const reportedInclude: any = {
      model: User,
      as: "reportedUser",
      attributes: USER_PUBLIC_ATTRS,
    };

    if (filters.search) {
      const term = `%${filters.search}%`;
      where[Op.or] = [
        { contentPreview: { [Op.iLike]: term } },
        { "$reporter.name$": { [Op.iLike]: term } },
        { "$reporter.businessName$": { [Op.iLike]: term } },
        { "$reportedUser.name$": { [Op.iLike]: term } },
        { "$reportedUser.businessName$": { [Op.iLike]: term } },
      ];
    }

    const { count, rows } = await ContentReport.findAndCountAll({
      where,
      subQuery: false,
      include: [
        reporterInclude,
        reportedInclude,
        { model: User, as: "originalUser", attributes: USER_PUBLIC_ATTRS, required: false },
        { model: User, as: "resolvedBy", attributes: ["id", "name", "email"], required: false },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return {
      reports: rows.map((row) => this.serialize(row)),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit) || 1,
        totalItems: count,
        itemsPerPage: limit,
      },
    };
  }

  static async getReportById(id: string) {
    const report = await ContentReport.findByPk(id, {
      include: [
        { model: User, as: "reporter", attributes: USER_PUBLIC_ATTRS },
        { model: User, as: "reportedUser", attributes: USER_PUBLIC_ATTRS },
        { model: User, as: "originalUser", attributes: USER_PUBLIC_ATTRS, required: false },
        { model: User, as: "resolvedBy", attributes: ["id", "name", "email"], required: false },
      ],
    });
    if (!report) {
      throw new Error("Report not found");
    }
    return this.serialize(report);
  }

  static async resolveReport(
    reportId: string,
    adminId: string,
    action: "dismiss" | "warn" | "suspend",
    adminNote?: string | null
  ) {
    const report = await ContentReport.findByPk(reportId);
    if (!report) {
      throw new Error("Report not found");
    }
    if (report.status !== "pending") {
      throw new Error("This report has already been resolved");
    }

    const reportedUser = await User.findByPk(report.reportedUserId);
    if (!reportedUser) {
      throw new Error("Reported user not found");
    }

    const note = adminNote?.trim() ? adminNote.trim().slice(0, 300) : null;
    const now = new Date();

    if (action === "dismiss") {
      await report.update({
        status: "dismissed",
        adminNote: note,
        resolvedById: adminId,
        resolvedAt: now,
      });
    } else if (action === "warn") {
      await reportedUser.update({
        warningCount: (reportedUser.warningCount || 0) + 1,
      });
      await report.update({
        status: "warned",
        adminNote: note,
        resolvedById: adminId,
        resolvedAt: now,
      });
      await this.notifyReportedUser({
        userId: reportedUser.id,
        title: "Community guidelines warning",
        content:
          "Your account received a warning after a content report. Please follow Booqly community guidelines.",
        reportId: report.id,
        action: "warn",
      });
    } else if (action === "suspend") {
      await reportedUser.update({ isSuspended: true });
      await report.update({
        status: "suspended",
        adminNote: note,
        resolvedById: adminId,
        resolvedAt: now,
      });
      await this.notifyReportedUser({
        userId: reportedUser.id,
        title: "Account suspended",
        content:
          "Your Booqly account has been suspended following a content report. Contact support if you think this is a mistake.",
        reportId: report.id,
        action: "suspend",
      });
    } else {
      throw new Error("Invalid action");
    }

    return this.getReportById(reportId);
  }

  private static async notifyReportedUser(params: {
    userId: string;
    title: string;
    content: string;
    reportId: string;
    action: string;
  }) {
    try {
      await NotificationService.createNotification({
        userId: params.userId,
        type: "review",
        title: params.title,
        content: params.content,
        data: { reportId: params.reportId, action: params.action },
      });
    } catch (error) {
      console.warn("Failed to notify reported user:", error);
    }
  }

  private static async buildContentSnapshot(input: CreateContentReportInput) {
    let contentPreview = input.contentPreview?.trim() || null;
    let contentThumbnailUrl = input.contentThumbnailUrl?.trim() || null;

    if (input.contentType === "message") {
      const message = await Message.findByPk(input.contentId);
      if (message) {
        contentPreview = contentPreview || message.content || `[${message.messageType} message]`;
        if (!contentThumbnailUrl && message.messageType === "image") {
          contentThumbnailUrl = message.content;
        }
      }
    }

    if (input.contentType === "service_listing") {
      const service = await Service.findByPk(input.contentId, {
        include: [{ model: Marketplace, as: "marketplace", attributes: ["id", "businessName", "userId"] }],
      });
      if (service) {
        contentPreview = contentPreview || `${service.name}${service.description ? ` — ${service.description}` : ""}`;
        contentThumbnailUrl = contentThumbnailUrl || service.imageUrl || null;
      }
    }

    if (input.contentType === "profile") {
      const user = await User.findByPk(input.reportedUserId);
      if (user) {
        contentPreview = contentPreview || user.businessName || user.name || "Profile";
        contentThumbnailUrl = contentThumbnailUrl || user.profilePic || null;
      }
    }

    if (input.contentType === "photo") {
      contentPreview = contentPreview || "Photo";
      contentThumbnailUrl = contentThumbnailUrl || input.contentId;
    }

    return { contentPreview, contentThumbnailUrl };
  }

  private static serialize(report: ContentReport) {
    const reporter = (report as any).reporter as User | undefined;
    const reportedUser = (report as any).reportedUser as User | undefined;
    const originalUser = (report as any).originalUser as User | undefined;

    return {
      id: report.id,
      contentType: report.contentType,
      contentId: report.contentId,
      reason: report.reason,
      reasonLabel: this.reasonLabel(report.reason),
      contentTypeLabel: this.contentTypeLabel(report.contentType),
      details: report.details,
      contentPreview: report.contentPreview,
      contentThumbnailUrl: report.contentThumbnailUrl,
      status: report.status,
      adminNote: report.adminNote,
      createdAt: report.createdAt,
      resolvedAt: report.resolvedAt,
      reporter: reporter
        ? {
            id: reporter.id,
            name: reporter.name,
            role: reporter.role,
            profilePic: reporter.profilePic,
            businessName: reporter.businessName,
          }
        : null,
      reportedUser: reportedUser
        ? {
            id: reportedUser.id,
            name: reportedUser.name,
            role: reportedUser.role,
            profilePic: reportedUser.profilePic,
            businessName: reportedUser.businessName,
            isSuspended: reportedUser.isSuspended,
            warningCount: reportedUser.warningCount,
          }
        : null,
      originalUser: originalUser
        ? {
            id: originalUser.id,
            name: originalUser.name,
            role: originalUser.role,
            profilePic: originalUser.profilePic,
            businessName: originalUser.businessName,
          }
        : null,
    };
  }

  static reasonLabel(reason: ContentReportReason) {
    const labels: Record<ContentReportReason, string> = {
      inappropriate_content: "Inappropriate Content",
      nudity: "Nudity",
      misleading_information: "Misleading Information",
      impersonation: "Impersonation",
      harassment: "Harassment",
    };
    return labels[reason] || reason;
  }

  static contentTypeLabel(type: ContentReportType) {
    const labels: Record<ContentReportType, string> = {
      message: "Message",
      photo: "Photo",
      service_listing: "Service Listing",
      profile: "Profile",
    };
    return labels[type] || type;
  }
}
