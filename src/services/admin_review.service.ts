import { Op } from "sequelize";
import { Review } from "../models/review_model";
import { ReviewFlag, ReviewDirection, ReviewFlagStatus } from "../models/review_flag_model";
import { User } from "../models/user_model";
import { Marketplace } from "../models/marketplace_model";
import { ReviewService } from "./review.service";
import { NotificationService } from "./notification.service";

export type ModerationStatus = "pending" | "flagged" | "approved" | "rejected";
export type ModerationType = "flag" | "semi_verified";

export interface AdminModerationFilters {
  status?: ModerationStatus;
  moderationType?: ModerationType | "all";
  reviewDirection?: ReviewDirection;
  page?: number;
  limit?: number;
}

export class AdminReviewService {
  private static async getMarketplaceForProvider(providerId: string) {
    const marketplace = await Marketplace.findOne({
      where: { userId: providerId },
      attributes: ["id", "businessName", "userId"],
    });
    return marketplace;
  }

  private static formatReviewer(
    review: Review,
    direction: ReviewDirection
  ) {
    const reviewJson = review.toJSON() as any;
    if (direction === "client_to_provider") {
      return {
        id: review.clientId,
        name: reviewJson.client?.name ?? "Client",
        profilePic: reviewJson.client?.profilePic ?? null,
      };
    }

    return {
      id: review.providerId,
      name:
        reviewJson.provider?.marketplace?.businessName?.trim() ||
        reviewJson.provider?.name?.trim() ||
        "Provider",
      profilePic: reviewJson.provider?.profilePic ?? null,
    };
  }

  private static formatReviewContent(review: Review, direction: ReviewDirection) {
    if (direction === "client_to_provider") {
      return {
        rating: review.rating,
        comment: review.comment,
        proofDocument: review.proofDocument,
      };
    }

    return {
      rating: review.providerRating,
      comment: review.providerResponse,
      proofDocument: null,
    };
  }

  private static async buildFlagModerationItem(flag: ReviewFlag) {
    const review = (flag as any).review as Review;
    const marketplace = await this.getMarketplaceForProvider(review.providerId);
    const reviewJson = review.toJSON() as any;

    return {
      id: flag.id,
      moderationType: "flag" as ModerationType,
      status: flag.status,
      reviewDirection: flag.reviewDirection,
      flagReason: flag.reason,
      adminNote: flag.adminNote,
      submittedAt: flag.createdAt,
      resolvedAt: flag.resolvedAt,
      review: {
        id: review.id,
        type: review.type,
        status: review.status,
        isPublic: review.isPublic,
        ...this.formatReviewContent(review, flag.reviewDirection),
        createdAt: review.createdAt,
      },
      provider: {
        id: review.providerId,
        name:
          marketplace?.businessName?.trim() ||
          reviewJson.provider?.name?.trim() ||
          "Provider",
        profilePic: reviewJson.provider?.profilePic ?? null,
      },
      marketplace: marketplace
        ? {
            id: marketplace.id,
            businessName: marketplace.businessName,
          }
        : null,
      reviewer: this.formatReviewer(review, flag.reviewDirection),
      flaggedBy: (flag as any).flaggedBy
        ? {
            id: (flag as any).flaggedBy.id,
            name: (flag as any).flaggedBy.name,
            profilePic: (flag as any).flaggedBy.profilePic ?? null,
          }
        : null,
    };
  }

  private static async buildSemiVerifiedModerationItem(review: Review) {
    const marketplace = await this.getMarketplaceForProvider(review.providerId);
    const reviewJson = review.toJSON() as any;

    return {
      id: review.id,
      moderationType: "semi_verified" as ModerationType,
      status: review.status as ModerationStatus,
      reviewDirection: "client_to_provider" as ReviewDirection,
      flagReason: null,
      adminNote: null,
      submittedAt: review.createdAt,
      resolvedAt: review.status !== "pending" ? review.updatedAt : null,
      review: {
        id: review.id,
        type: review.type,
        status: review.status,
        isPublic: review.isPublic,
        rating: review.rating,
        comment: review.comment,
        proofDocument: review.proofDocument,
        createdAt: review.createdAt,
      },
      provider: {
        id: review.providerId,
        name:
          marketplace?.businessName?.trim() ||
          reviewJson.provider?.name?.trim() ||
          "Provider",
        profilePic: reviewJson.provider?.profilePic ?? null,
      },
      marketplace: marketplace
        ? {
            id: marketplace.id,
            businessName: marketplace.businessName,
          }
        : null,
      reviewer: this.formatReviewer(review, "client_to_provider"),
      flaggedBy: null,
    };
  }

  static async getModerationQueue(filters: AdminModerationFilters = {}) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = (page - 1) * limit;
    const moderationType = filters.moderationType ?? "all";

    const reviewInclude = [
      {
        model: User,
        as: "client",
        attributes: ["id", "name", "profilePic"],
      },
      {
        model: User,
        as: "provider",
        attributes: ["id", "name", "profilePic"],
      },
    ];

    const items: any[] = [];

    if (moderationType === "all" || moderationType === "flag") {
      const flagWhere: any = {};
      if (filters.status) {
        flagWhere.status = filters.status;
      }
      if (filters.reviewDirection) {
        flagWhere.reviewDirection = filters.reviewDirection;
      }

      const flags = await ReviewFlag.findAll({
        where: flagWhere,
        include: [
          {
            model: Review,
            as: "review",
            include: reviewInclude,
          },
          {
            model: User,
            as: "flaggedBy",
            attributes: ["id", "name", "profilePic"],
          },
        ],
        order: [["createdAt", "DESC"]],
      });

      for (const flag of flags) {
        if ((flag as any).review) {
          items.push(await this.buildFlagModerationItem(flag));
        }
      }
    }

    if (moderationType === "all" || moderationType === "semi_verified") {
      const reviewWhere: any = {
        type: "semi_verified",
      };

      if (filters.status) {
        reviewWhere.status = filters.status;
      } else {
        reviewWhere.status = { [Op.in]: ["pending", "approved", "rejected"] };
      }

      const semiVerifiedReviews = await Review.findAll({
        where: reviewWhere,
        include: reviewInclude,
        order: [["createdAt", "DESC"]],
      });

      for (const review of semiVerifiedReviews) {
        items.push(await this.buildSemiVerifiedModerationItem(review));
      }
    }

    items.sort(
      (a, b) =>
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );

    const total = items.length;
    const paginatedItems = items.slice(offset, offset + limit);

    return {
      items: paginatedItems,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit) || 1,
        totalItems: total,
        itemsPerPage: limit,
      },
    };
  }

  static async resolveFlag(
    flagId: string,
    status: "approved" | "rejected",
    adminId: string,
    adminNote?: string
  ) {
    const flag = await ReviewFlag.findByPk(flagId, {
      include: [{ model: Review, as: "review" }],
    });

    if (!flag) {
      throw new Error("Flag request not found");
    }

    if (!["approved", "rejected"].includes(status)) {
      throw new Error("Status must be approved or rejected");
    }

    const review = (flag as any).review as Review;
    if (!review) {
      throw new Error("Associated review not found");
    }

    await flag.update({
      status,
      adminNote: adminNote ?? null,
      resolvedById: adminId,
      resolvedAt: new Date(),
    });

    if (status === "approved") {
      if (flag.reviewDirection === "client_to_provider") {
        await review.update({
          isPublic: false,
          status: "rejected",
        });
      } else {
        await review.update({
          providerResponse: null,
          providerRating: null,
          respondedAt: null,
        });
      }

      await NotificationService.createNotification({
        userId: flag.flaggedById,
        type: "review",
        title: "Flag Approved",
        content: "Your flagged review report was approved. The review has been hidden.",
        data: { reviewId: review.id, flagId: flag.id },
      });
    } else {
      await NotificationService.createNotification({
        userId: flag.flaggedById,
        type: "review",
        title: "Flag Rejected",
        content: "Your flagged review report was reviewed and dismissed.",
        data: { reviewId: review.id, flagId: flag.id },
      });
    }

    return flag;
  }

  static async updateReviewByAdmin(
    reviewId: string,
    updateData: {
      rating?: number;
      comment?: string;
      providerRating?: number;
      providerResponse?: string;
      status?: "pending" | "approved" | "rejected";
      isPublic?: boolean;
    }
  ) {
    const review = await Review.findByPk(reviewId);
    if (!review) {
      throw new Error("Review not found");
    }

    await review.update(updateData);
    return review;
  }

  static async reclassifyReview(
    reviewId: string,
    type: "verified" | "semi_verified"
  ) {
    const review = await Review.findByPk(reviewId);
    if (!review) {
      throw new Error("Review not found");
    }

    const updateData: any = { type };
    if (type === "verified") {
      updateData.status = "approved";
    } else if (review.status === "approved" && type === "semi_verified") {
      updateData.status = "pending";
    }

    await review.update(updateData);
    return review;
  }

  static async deleteReviewByAdmin(reviewId: string) {
    await ReviewService.deleteReview(reviewId, "", true);
  }

  static async updateSemiVerifiedStatus(
    reviewId: string,
    status: "pending" | "approved" | "rejected",
    adminId: string
  ) {
    return ReviewService.updateReviewStatus(reviewId, status, adminId);
  }
}
