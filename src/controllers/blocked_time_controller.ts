import { Response } from "express";
import { Op } from "sequelize";
import { BlockedTime } from "../models/blocked_time_model";
import { Marketplace } from "../models/marketplace_model";
import { User } from "../models/user_model";
import { AuthRequest } from "../middlewares/auth.middleware";

function mapFrequency(raw: unknown): "one_time" | "daily" | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (normalized === "one_time" || normalized === "onetime") return "one_time";
  if (normalized === "daily") return "daily";
  return null;
}

async function assertMarketplaceAccess(
  requester: User,
  marketplaceId: string
): Promise<Marketplace | null> {
  const marketplace = await Marketplace.findByPk(marketplaceId);
  if (!marketplace) return null;

  const isOwner = marketplace.userId === requester.id;
  const isTeamMember =
    requester.isTeamMember === true &&
    requester.teamOwnerId === marketplace.userId;
  if (!isOwner && !isTeamMember) return null;
  return marketplace;
}

export const createBlockedTime = async (
  req: AuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const requester = req.user as User;
    if (!requester || (requester.role !== "solo" && requester.role !== "suite")) {
      return res.status(403).json({
        status: false,
        message: "Only providers can create blocked times.",
      });
    }

    const {
      marketplaceId,
      blockType,
      customBlockType,
      startDateTime,
      endDateTime,
      frequency,
      comments,
    } = req.body;

    if (!marketplaceId || !blockType || !startDateTime || !endDateTime) {
      return res.status(400).json({
        status: false,
        message:
          "marketplaceId, blockType, startDateTime, and endDateTime are required.",
      });
    }

    const mappedFrequency = mapFrequency(frequency ?? "one_time");
    if (!mappedFrequency) {
      return res.status(400).json({
        status: false,
        message: 'frequency must be "One Time"/"one_time" or "Daily"/"daily".',
      });
    }

    const start = new Date(startDateTime);
    const end = new Date(endDateTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({
        status: false,
        message: "startDateTime must be before endDateTime.",
      });
    }

    const marketplace = await assertMarketplaceAccess(requester, marketplaceId);
    if (!marketplace) {
      return res.status(403).json({
        status: false,
        message: "Marketplace not found or access denied.",
      });
    }

    const resolvedType = String(blockType).trim();
    if (!resolvedType) {
      return res.status(400).json({
        status: false,
        message: "blockType is required.",
      });
    }

    if (
      resolvedType.toLowerCase() === "other" &&
      (!customBlockType || !String(customBlockType).trim())
    ) {
      return res.status(400).json({
        status: false,
        message: "customBlockType is required when blockType is Other.",
      });
    }

    const blocked = await BlockedTime.create({
      marketplaceId,
      createdByUserId: requester.id,
      assignedTeamMemberId: requester.isTeamMember ? requester.id : null,
      blockType: resolvedType,
      customBlockType:
        resolvedType.toLowerCase() === "other"
          ? String(customBlockType).trim()
          : null,
      startDateTime: start,
      endDateTime: end,
      frequency: mappedFrequency,
      comments: comments ? String(comments).trim() : null,
    });

    return res.status(201).json({
      status: true,
      message: "Blocked time created successfully.",
      data: blocked,
    });
  } catch (error: any) {
    console.error("Error creating blocked time:", error);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${error.message || error}`,
    });
  }
};

export const getBlockedTimes = async (
  req: AuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const requester = req.user as User;
    const { marketplaceId, startDate, endDate } = req.query as {
      marketplaceId?: string;
      startDate?: string;
      endDate?: string;
    };

    if (!marketplaceId) {
      return res.status(400).json({
        status: false,
        message: "marketplaceId is required.",
      });
    }

    const marketplace = await assertMarketplaceAccess(requester, marketplaceId);
    if (!marketplace) {
      return res.status(403).json({
        status: false,
        message: "Marketplace not found or access denied.",
      });
    }

    const where: any = { marketplaceId };

    if (requester.isTeamMember) {
      where.assignedTeamMemberId = requester.id;
    }

    if (startDate && endDate) {
      const rangeStart = new Date(startDate);
      const rangeEnd = new Date(endDate);
      if (!isNaN(rangeStart.getTime()) && !isNaN(rangeEnd.getTime())) {
        // Include one-time blocks that overlap the range, plus all daily blocks
        // for this marketplace (expanded on the client / occupancy checks).
        where[Op.or] = [
          {
            frequency: "one_time",
            startDateTime: { [Op.lte]: rangeEnd },
            endDateTime: { [Op.gte]: rangeStart },
          },
          { frequency: "daily" },
        ];
      }
    }

    const rows = await BlockedTime.findAll({
      where,
      order: [["startDateTime", "ASC"]],
    });

    return res.status(200).json({
      status: true,
      message: "Blocked times fetched successfully.",
      data: { blockedTimes: rows },
    });
  } catch (error: any) {
    console.error("Error fetching blocked times:", error);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${error.message || error}`,
    });
  }
};
