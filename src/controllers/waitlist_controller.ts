import { Response } from "express";
import { Marketplace } from "../models/marketplace_model";
import { Waitlist } from "../models/waitlist_model";
import { WaitlistService } from "../services/waitlist.service";

export const joinWaitlist = async (req: any, res: Response): Promise<Response> => {
  try {
    const clientUserId = req.user.id as string;
    const { marketplaceId, dateTime, note } = req.body as {
      marketplaceId?: string;
      dateTime?: string;
      note?: string;
    };

    if (!marketplaceId || !dateTime) {
      return res.status(400).json({
        status: false,
        message: "marketplaceId and dateTime are required.",
      });
    }

    const slotDate = new Date(dateTime);
    if (Number.isNaN(slotDate.getTime())) {
      return res.status(400).json({
        status: false,
        message: "dateTime must be a valid ISO date.",
      });
    }

    const marketplace = await Marketplace.findByPk(marketplaceId);
    if (!marketplace) {
      return res.status(404).json({
        status: false,
        message: "Marketplace not found.",
      });
    }

    if (!marketplace.waitlistEnabled) {
      return res.status(400).json({
        status: false,
        message: "Provider has not enabled waitlist for this marketplace.",
      });
    }

    const occupied = await WaitlistService.isSlotOccupied(marketplaceId, slotDate);
    if (!occupied) {
      return res.status(400).json({
        status: false,
        message: "This slot is currently available. Please book directly.",
      });
    }

    const entry = await WaitlistService.joinWaitlist({
      clientUserId,
      marketplaceId,
      dateTime: slotDate,
      note,
    });

    return res.status(201).json({
      status: true,
      message: "Joined waitlist successfully.",
      data: entry,
    });
  } catch (error: any) {
    console.error("Error joining waitlist:", error);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${error.message || error}`,
    });
  }
};

export const getMyWaitlistEntries = async (req: any, res: Response): Promise<Response> => {
  try {
    const clientUserId = req.user.id as string;

    const entries = await Waitlist.findAll({
      where: { clientUserId },
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      status: true,
      message: "Waitlist entries fetched successfully.",
      data: entries,
    });
  } catch (error: any) {
    console.error("Error fetching waitlist entries:", error);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${error.message || error}`,
    });
  }
};

export const claimWaitlistSpot = async (req: any, res: Response): Promise<Response> => {
  try {
    const clientUserId = req.user.id as string;
    const { waitlistId } = req.body as { waitlistId?: string };

    if (!waitlistId) {
      return res.status(400).json({
        status: false,
        message: "waitlistId is required.",
      });
    }

    const result = await WaitlistService.claimWaitlistSpot(clientUserId, waitlistId);

    if (!result.entry) {
      if (result.reason === "not_found") {
        return res.status(404).json({
          status: false,
          message: "Waitlist entry not found.",
        });
      }

      if (result.reason === "not_owner") {
        return res.status(403).json({
          status: false,
          message: "You can only claim your own waitlist entry.",
        });
      }

      if (result.reason === "invalid_status") {
        return res.status(409).json({
          status: false,
          message: "This waitlist entry is no longer claimable.",
        });
      }

      if (result.reason === "expired" || result.reason === "missing_expiry") {
        return res.status(410).json({
          status: false,
          message: "Claim window expired for this waitlist entry.",
        });
      }

      return res.status(400).json({
        status: false,
        message: "Claim failed.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Waitlist spot claimed successfully.",
      data: result.entry,
    });
  } catch (error: any) {
    console.error("Error claiming waitlist spot:", error);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${error.message || error}`,
    });
  }
};

export const cancelWaitlistEntry = async (req: any, res: Response): Promise<Response> => {
  try {
    const clientUserId = req.user.id as string;
    const { waitlistId } = req.params as { waitlistId?: string };

    if (!waitlistId) {
      return res.status(400).json({
        status: false,
        message: "waitlistId is required.",
      });
    }

    const cancelled = await WaitlistService.cancelWaitlistEntry(clientUserId, waitlistId);

    if (!cancelled) {
      return res.status(404).json({
        status: false,
        message: "Active waitlist entry not found.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Waitlist entry cancelled successfully.",
    });
  } catch (error: any) {
    console.error("Error cancelling waitlist entry:", error);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${error.message || error}`,
    });
  }
};

export const getMarketplaceWaitlist = async (req: any, res: Response): Promise<Response> => {
  try {
    const marketplaceId = (req.query.marketplaceId as string) || req.user.marketplaceId;

    if (!marketplaceId) {
      return res.status(400).json({
        status: false,
        message: "marketplaceId is required.",
      });
    }

    if (req.user.marketplaceId !== marketplaceId) {
      return res.status(403).json({
        status: false,
        message: "You can only view your own marketplace waitlist.",
      });
    }

    const entries = await Waitlist.findAll({
      where: { marketplaceId },
      order: [["dateTime", "ASC"], ["createdAt", "ASC"]],
    });

    return res.status(200).json({
      status: true,
      message: "Marketplace waitlist fetched successfully.",
      data: entries,
    });
  } catch (error: any) {
    console.error("Error fetching marketplace waitlist:", error);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${error.message || error}`,
    });
  }
};
