import { Response } from "express";
import { Schedule } from "../models/schedule_model";
import { Marketplace } from "../models/marketplace_model";

const UPDATABLE_FIELDS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

type UpdateScheduleData = Partial<
  Record<(typeof UPDATABLE_FIELDS)[number], string>
>;

export const updateSchedule = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const {
      scheduleId,
      monday,
      tuesday,
      wednesday,
      thursday,
      friday,
      saturday,
      sunday,
    } = req.body;

    if (!scheduleId) {
      return res.status(400).json({
        status: false,
        message: "Please pass a valid schedule id",
      });
    }

    // Verify user owns the marketplace that uses this schedule
    const user = req.user;
    const marketplace = await Marketplace.findOne({
      where: { 
        scheduleId: scheduleId,
        id: user.marketplaceId 
      }
    });

    if (!marketplace) {
      return res.status(403).json({
        status: false,
        message: "You can only update schedules for your own marketplace.",
      });
    }

    const updateData: UpdateScheduleData = {};
    if (monday !== undefined) updateData.monday = monday;
    if (tuesday !== undefined) updateData.tuesday = tuesday;
    if (wednesday !== undefined) updateData.wednesday = wednesday;
    if (thursday !== undefined) updateData.thursday = thursday;
    if (friday !== undefined) updateData.friday = friday;
    if (saturday !== undefined) updateData.saturday = saturday;
    if (sunday !== undefined) updateData.sunday = sunday;

    if (Object.keys(updateData).length === 0) {
      return res.status(200).json({
        status: false,
        message:
          "No valid fields to update. Provide at least one of: monday, tuesday, wednesday, thursday, friday, saturday, sunday.",
      });
    }

    const [updatedCount] = await Schedule.update(updateData, {
      where: { id: scheduleId, deletedAt: null },
      returning: true,
    });

    if (updatedCount === 0) {
      return res.status(200).json({
        status: false,
        message: "No record found for this schedule Id or record is deleted.",
      });
    }

    const updatedSchedule = await Schedule.findByPk(scheduleId);

    return res.status(200).json({
      status: true,
      message: "Schedule updated successfully",
      data: updatedSchedule,
    });
  } catch (error) {
    console.error("Error updating schedule data:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Update schedule by marketplace ID (more convenient for frontend)
export const updateMarketplaceSchedule = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const {
      marketplaceId,
      monday,
      tuesday,
      wednesday,
      thursday,
      friday,
      saturday,
      sunday,
    } = req.body;

    if (!marketplaceId) {
      return res.status(400).json({
        status: false,
        message: "marketplaceId is required",
      });
    }

    // Verify user owns the marketplace
    const user = req.user;
    if (user.marketplaceId !== marketplaceId) {
      return res.status(403).json({
        status: false,
        message: "You can only update schedules for your own marketplace.",
      });
    }

    // Get marketplace
    const marketplace = await Marketplace.findByPk(marketplaceId);

    if (!marketplace || !marketplace.scheduleId) {
      return res.status(404).json({
        status: false,
        message: "Marketplace or schedule not found.",
      });
    }

    const updateData: UpdateScheduleData = {};
    if (monday !== undefined) updateData.monday = monday;
    if (tuesday !== undefined) updateData.tuesday = tuesday;
    if (wednesday !== undefined) updateData.wednesday = wednesday;
    if (thursday !== undefined) updateData.thursday = thursday;
    if (friday !== undefined) updateData.friday = friday;
    if (saturday !== undefined) updateData.saturday = saturday;
    if (sunday !== undefined) updateData.sunday = sunday;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        status: false,
        message:
          "No valid fields to update. Provide at least one day schedule.",
      });
    }

    const [updatedCount] = await Schedule.update(updateData, {
      where: { id: marketplace.scheduleId, deletedAt: null },
      returning: true,
    });

    if (updatedCount === 0) {
      return res.status(404).json({
        status: false,
        message: "Schedule not found or could not be updated.",
      });
    }

    const updatedSchedule = await Schedule.findByPk(marketplace.scheduleId);

    return res.status(200).json({
      status: true,
      message: "Schedule updated successfully",
      data: updatedSchedule,
    });

  } catch (error) {
    console.error("Error updating marketplace schedule:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
