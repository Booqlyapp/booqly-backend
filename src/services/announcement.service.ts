import { Op } from "sequelize";
import {
  Announcement,
  AnnouncementAudience,
  AnnouncementIconType,
  AnnouncementStatus,
  AnnouncementType,
} from "../models/announcement_model";
import { User } from "../models/user_model";

const TYPE_LABELS: Record<AnnouncementType, string> = {
  policy_update: "Policy Update",
  promotion: "Promotion",
  system_update: "System Update",
  feature_update: "Feature Update",
  alert: "Alert",
};

const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  all_users: "All Users",
  active_users: "Active Users",
  clients: "Clients",
  providers: "Providers",
};

const STATUS_LABELS: Record<AnnouncementStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
  expired: "Expired",
};

const DEFAULT_ICON_BY_TYPE: Record<AnnouncementType, AnnouncementIconType> = {
  policy_update: "megaphone",
  promotion: "gift",
  system_update: "wrench",
  feature_update: "star",
  alert: "warning",
};

export interface CreateAnnouncementInput {
  title: string;
  description?: string | null;
  iconType?: AnnouncementIconType;
  audience: AnnouncementAudience;
  type: AnnouncementType;
  status?: AnnouncementStatus;
  scheduledAt?: string | Date | null;
  expiresAt?: string | Date | null;
  createdById: string;
}

export interface UpdateAnnouncementInput {
  title?: string;
  description?: string | null;
  iconType?: AnnouncementIconType;
  audience?: AnnouncementAudience;
  type?: AnnouncementType;
  status?: AnnouncementStatus;
  scheduledAt?: string | Date | null;
  expiresAt?: string | Date | null;
}

export class AnnouncementService {
  /** Promote due scheduled items and expire published ones past expiresAt. */
  static async syncLifecycleStatuses() {
    const now = new Date();

    await Announcement.update(
      { status: "published", publishedAt: now },
      {
        where: {
          status: "scheduled",
          scheduledAt: { [Op.lte]: now },
        },
      }
    );

    await Announcement.update(
      { status: "expired" },
      {
        where: {
          status: "published",
          expiresAt: { [Op.ne]: null, [Op.lte]: now },
        },
      }
    );
  }

  static async getStats() {
    await this.syncLifecycleStatuses();

    const now = new Date();
    const last7Start = new Date(now);
    last7Start.setDate(last7Start.getDate() - 7);
    const prev7Start = new Date(now);
    prev7Start.setDate(prev7Start.getDate() - 14);

    const [
      total,
      published,
      scheduled,
      drafts,
      totalLast7,
      totalPrev7,
      publishedLast7,
      publishedPrev7,
      scheduledLast7,
      scheduledPrev7,
      draftsLast7,
      draftsPrev7,
    ] = await Promise.all([
      Announcement.count(),
      Announcement.count({ where: { status: "published" } }),
      Announcement.count({ where: { status: "scheduled" } }),
      Announcement.count({ where: { status: "draft" } }),
      Announcement.count({
        where: { createdAt: { [Op.gte]: last7Start } },
      }),
      Announcement.count({
        where: {
          createdAt: { [Op.gte]: prev7Start, [Op.lt]: last7Start },
        },
      }),
      Announcement.count({
        where: {
          status: "published",
          publishedAt: { [Op.gte]: last7Start },
        },
      }),
      Announcement.count({
        where: {
          publishedAt: { [Op.gte]: prev7Start, [Op.lt]: last7Start },
        },
      }),
      Announcement.count({
        where: {
          status: "scheduled",
          createdAt: { [Op.gte]: last7Start },
        },
      }),
      Announcement.count({
        where: {
          status: "scheduled",
          createdAt: { [Op.gte]: prev7Start, [Op.lt]: last7Start },
        },
      }),
      Announcement.count({
        where: {
          status: "draft",
          createdAt: { [Op.gte]: last7Start },
        },
      }),
      Announcement.count({
        where: {
          status: "draft",
          createdAt: { [Op.gte]: prev7Start, [Op.lt]: last7Start },
        },
      }),
    ]);

    return {
      totalAnnouncements: {
        count: total,
        percentChange: this.percentChange(totalLast7, totalPrev7),
      },
      published: {
        count: published,
        percentChange: this.percentChange(publishedLast7, publishedPrev7),
      },
      scheduled: {
        count: scheduled,
        percentChange: this.percentChange(scheduledLast7, scheduledPrev7),
      },
      drafts: {
        count: drafts,
        percentChange: this.percentChange(draftsLast7, draftsPrev7),
      },
      period: "last_7_days",
    };
  }

  static async list(filters: {
    page?: number;
    limit?: number;
    status?: AnnouncementStatus | "all";
    type?: AnnouncementType;
    audience?: AnnouncementAudience;
    search?: string;
  }) {
    await this.syncLifecycleStatuses();

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const offset = (page - 1) * limit;

    const where: any = {};
    if (filters.status && filters.status !== "all") {
      where.status = filters.status;
    }
    if (filters.type) {
      where.type = filters.type;
    }
    if (filters.audience) {
      where.audience = filters.audience;
    }
    if (filters.search) {
      const term = `%${filters.search}%`;
      where[Op.or] = [
        { title: { [Op.iLike]: term } },
        { description: { [Op.iLike]: term } },
      ];
    }

    const { count, rows } = await Announcement.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: "createdBy",
          attributes: ["id", "name", "email", "role"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    return {
      announcements: rows.map((row) => this.serialize(row)),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit) || 1,
        totalItems: count,
        itemsPerPage: limit,
      },
    };
  }

  static async getById(id: string) {
    await this.syncLifecycleStatuses();

    const announcement = await Announcement.findByPk(id, {
      include: [
        {
          model: User,
          as: "createdBy",
          attributes: ["id", "name", "email", "role"],
        },
      ],
    });
    if (!announcement) {
      throw new Error("Announcement not found");
    }
    return this.serialize(announcement);
  }

  static async create(input: CreateAnnouncementInput) {
    const status = input.status || "draft";
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

    this.validateStatusTiming(status, scheduledAt, expiresAt);

    const now = new Date();
    let publishedAt: Date | null = null;
    let finalStatus = status;

    if (status === "published") {
      publishedAt = now;
    } else if (status === "scheduled") {
      if (!scheduledAt) {
        throw new Error("scheduledAt is required for scheduled announcements");
      }
      if (scheduledAt <= now) {
        finalStatus = "published";
        publishedAt = now;
      }
    }

    const announcement = await Announcement.create({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      iconType: input.iconType || DEFAULT_ICON_BY_TYPE[input.type],
      audience: input.audience,
      type: input.type,
      status: finalStatus,
      scheduledAt,
      publishedAt,
      expiresAt,
      createdById: input.createdById,
    });

    return this.getById(announcement.id);
  }

  static async update(id: string, input: UpdateAnnouncementInput) {
    const announcement = await Announcement.findByPk(id);
    if (!announcement) {
      throw new Error("Announcement not found");
    }

    const nextType = input.type || announcement.type;
    const nextStatus = input.status || announcement.status;
    const scheduledAt =
      input.scheduledAt !== undefined
        ? input.scheduledAt
          ? new Date(input.scheduledAt)
          : null
        : announcement.scheduledAt;
    const expiresAt =
      input.expiresAt !== undefined
        ? input.expiresAt
          ? new Date(input.expiresAt)
          : null
        : announcement.expiresAt;

    this.validateStatusTiming(nextStatus, scheduledAt, expiresAt);

    const updates: Partial<Announcement> = {};
    if (input.title !== undefined) updates.title = input.title.trim();
    if (input.description !== undefined) {
      updates.description = input.description?.trim() || null;
    }
    if (input.iconType !== undefined) updates.iconType = input.iconType;
    if (input.audience !== undefined) updates.audience = input.audience;
    if (input.type !== undefined) {
      updates.type = input.type;
      if (input.iconType === undefined && !announcement.iconType) {
        updates.iconType = DEFAULT_ICON_BY_TYPE[nextType];
      }
    }
    if (input.scheduledAt !== undefined) updates.scheduledAt = scheduledAt;
    if (input.expiresAt !== undefined) updates.expiresAt = expiresAt;

    if (input.status !== undefined && input.status !== announcement.status) {
      const now = new Date();
      if (input.status === "published") {
        updates.status = "published";
        updates.publishedAt = announcement.publishedAt || now;
      } else if (input.status === "scheduled") {
        if (!scheduledAt) {
          throw new Error("scheduledAt is required for scheduled announcements");
        }
        if (scheduledAt <= now) {
          updates.status = "published";
          updates.publishedAt = now;
        } else {
          updates.status = "scheduled";
          updates.publishedAt = null;
        }
      } else if (input.status === "draft") {
        updates.status = "draft";
        updates.publishedAt = null;
      } else if (input.status === "expired") {
        updates.status = "expired";
      }
    }

    await announcement.update(updates);
    return this.getById(id);
  }

  static async publish(id: string) {
    const announcement = await Announcement.findByPk(id);
    if (!announcement) {
      throw new Error("Announcement not found");
    }
    if (announcement.status === "expired") {
      throw new Error("Cannot publish an expired announcement");
    }

    await announcement.update({
      status: "published",
      publishedAt: announcement.publishedAt || new Date(),
      scheduledAt: announcement.scheduledAt,
    });

    return this.getById(id);
  }

  static async schedule(id: string, scheduledAtInput: string | Date) {
    const announcement = await Announcement.findByPk(id);
    if (!announcement) {
      throw new Error("Announcement not found");
    }

    const scheduledAt = new Date(scheduledAtInput);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new Error("Invalid scheduledAt date");
    }
    if (scheduledAt <= new Date()) {
      throw new Error("scheduledAt must be in the future");
    }

    await announcement.update({
      status: "scheduled",
      scheduledAt,
      publishedAt: null,
    });

    return this.getById(id);
  }

  static async unpublish(id: string) {
    const announcement = await Announcement.findByPk(id);
    if (!announcement) {
      throw new Error("Announcement not found");
    }

    await announcement.update({
      status: "draft",
      publishedAt: null,
    });

    return this.getById(id);
  }

  static async remove(id: string) {
    const announcement = await Announcement.findByPk(id);
    if (!announcement) {
      throw new Error("Announcement not found");
    }
    await announcement.destroy();
    return { id };
  }

  private static validateStatusTiming(
    status: AnnouncementStatus,
    scheduledAt: Date | null,
    expiresAt: Date | null
  ) {
    if (status === "scheduled" && !scheduledAt) {
      throw new Error("scheduledAt is required for scheduled announcements");
    }
    if (scheduledAt && expiresAt && expiresAt <= scheduledAt) {
      throw new Error("expiresAt must be after scheduledAt");
    }
  }

  private static percentChange(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return Math.round((((current - previous) / previous) * 100) * 10) / 10;
  }

  private static serialize(announcement: Announcement) {
    const createdBy = (announcement as any).createdBy as User | undefined;

    return {
      id: announcement.id,
      title: announcement.title,
      description: announcement.description,
      iconType: announcement.iconType,
      audience: announcement.audience,
      audienceLabel: AUDIENCE_LABELS[announcement.audience],
      type: announcement.type,
      typeLabel: TYPE_LABELS[announcement.type],
      status: announcement.status,
      statusLabel: STATUS_LABELS[announcement.status],
      scheduledAt: announcement.scheduledAt,
      publishedAt: announcement.publishedAt,
      expiresAt: announcement.expiresAt,
      displayDate: announcement.publishedAt || announcement.scheduledAt,
      createdBy: createdBy
        ? {
            id: createdBy.id,
            name: createdBy.name || "Admin",
            email: createdBy.email,
            role: createdBy.role,
          }
        : null,
      createdAt: announcement.createdAt,
      updatedAt: announcement.updatedAt,
    };
  }
}
