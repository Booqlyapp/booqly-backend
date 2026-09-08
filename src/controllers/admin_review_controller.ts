import { Request, Response } from "express";
import { AdminReviewService } from "../services/admin_review.service";

interface AuthRequest extends Request {
  user?: any;
}

export const getModerationQueue = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      moderationType = "all",
      reviewDirection,
    } = req.query;

    const result = await AdminReviewService.getModerationQueue({
      page: parseInt(page as string) || 1,
      limit: Math.min(parseInt(limit as string) || 20, 100),
      status: status as any,
      moderationType: moderationType as any,
      reviewDirection: reviewDirection as any,
    });

    res.status(200).json({
      status: true,
      message: "Review moderation queue retrieved successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error fetching moderation queue:", error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Failed to fetch moderation queue",
    });
  }
};

export const resolveFlag = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { flagId } = req.params;
    const { status, adminNote } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      res.status(400).json({
        status: false,
        message: "Status must be approved or rejected",
      });
      return;
    }

    const flag = await AdminReviewService.resolveFlag(
      flagId,
      status,
      req.user!.id,
      adminNote
    );

    res.status(200).json({
      status: true,
      message: `Flag ${status} successfully`,
      data: flag,
    });
  } catch (error) {
    console.error("Error resolving flag:", error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Failed to resolve flag",
    });
  }
};

export const updateReviewByAdmin = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { reviewId } = req.params;
    const { rating, comment, providerRating, providerResponse, status, isPublic } =
      req.body;

    const review = await AdminReviewService.updateReviewByAdmin(reviewId, {
      rating,
      comment,
      providerRating,
      providerResponse,
      status,
      isPublic,
    });

    res.status(200).json({
      status: true,
      message: "Review updated successfully",
      data: review,
    });
  } catch (error) {
    console.error("Error updating review:", error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Failed to update review",
    });
  }
};

export const reclassifyReview = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { reviewId } = req.params;
    const { type } = req.body;

    if (!["verified", "semi_verified"].includes(type)) {
      res.status(400).json({
        status: false,
        message: "Type must be verified or semi_verified",
      });
      return;
    }

    const review = await AdminReviewService.reclassifyReview(reviewId, type);

    res.status(200).json({
      status: true,
      message: "Review reclassified successfully",
      data: review,
    });
  } catch (error) {
    console.error("Error reclassifying review:", error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Failed to reclassify review",
    });
  }
};

export const deleteReviewByAdmin = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { reviewId } = req.params;
    await AdminReviewService.deleteReviewByAdmin(reviewId);

    res.status(200).json({
      status: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting review:", error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Failed to delete review",
    });
  }
};

export const updateSemiVerifiedStatus = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { reviewId } = req.params;
    const { status } = req.body;

    if (!["pending", "approved", "rejected"].includes(status)) {
      res.status(400).json({
        status: false,
        message: "Invalid status. Must be pending, approved, or rejected",
      });
      return;
    }

    const review = await AdminReviewService.updateSemiVerifiedStatus(
      reviewId,
      status,
      req.user!.id
    );

    res.status(200).json({
      status: true,
      message: "Review status updated successfully",
      data: review,
    });
  } catch (error) {
    console.error("Error updating semi-verified status:", error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : "Failed to update review status",
    });
  }
};
