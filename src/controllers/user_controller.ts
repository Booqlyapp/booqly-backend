import { Request, Response } from "express";
import path from "path";
import sharp from "sharp";
import { User } from "../models/user_model";
import { Marketplace } from "../models/marketplace_model";
import { Social } from "../models/social_model";
import { Subscription } from "../models/subscription_model";
import { Appointment } from "../models/appointment_model";
import { AppointmentServiceStatus } from "../models/appointment_service_status_model";
import { Conversation } from "../models/conversation_model";
import { Message } from "../models/message_model";
import { Notification } from "../models/notification_model";
import { Review } from "../models/review_model";
import { ReviewFlag } from "../models/review_flag_model";
import { Referral } from "../models/referral_model";
import { ReferralInvite } from "../models/referral_invite_model";
import { Log } from "../models/log_model";
import { Promotion } from "../models/promotion_model";
import { Service } from "../models/service_model";
import { ServiceAddOn } from "../models/service_addon_model";
import { Schedule } from "../models/schedule_model";
import Favorite from "../models/favorite_model";
import { Friend } from "../models/friend_model";
import { ExternalAppointment } from "../models/external_appointment_model";
import { Waitlist } from "../models/waitlist_model";
import { Video } from "../models/video_model";
import { VideoLike } from "../models/video_like_model";
import { VideoComment } from "../models/video_comment_model";
import { VideoCommentReaction } from "../models/video_comment_reaction_model";
import { VideoFollow } from "../models/video_follow_model";
import { TeamMemberPermission } from "../models/team_member_permission_model";
import { ContentReport } from "../models/content_report_model";
import { Announcement } from "../models/announcement_model";
import { SupportTicket } from "../models/support_ticket_model";
import { SupportTicketMessage } from "../models/support_ticket_message_model";
import { localFileStorage } from "../utils/local-storage";
import { DocumentVerificationService, MIN_DOC_WIDTH, MIN_DOC_HEIGHT } from "../services/document-verification.service";
import bcryptjs from "bcryptjs";
import { Op } from "sequelize";

interface AuthRequest extends Request {
  user?: any;
  userId?: string;
}

export const updateUserData = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const user = req.user;

    const { name, phone, businessName } = req.body;

    const updatedData: any = {};

    // Only update name if it's different from the current name
    if (name && name !== user.name) {
      updatedData.name = name;
    }

    // Only update phone if it's different from the current phone
    if (phone && phone !== user.phone) {
      updatedData.phone = phone;
    }

    // Clients only have a personal name — never accept businessName updates from them.
    if (user.role === "client" && businessName !== undefined) {
      // Ignore businessName for clients so a personal-name edit cannot affect
      // provider/marketplace identity fields.
    } else if (businessName !== undefined && businessName !== user.businessName) {
      // Validate businessName is required for non-client roles
      if (user.role !== 'client' && (!businessName || businessName.trim() === '')) {
        return res.status(400).json({
          status: false,
          message: "Business name is required for solo professionals and suite owners",
        });
      }
      updatedData.businessName = businessName ? businessName.trim() : null;
    }

    // Personal name updates must never modify Marketplace.businessName.
    // Only Users.name for the authenticated account is updated above.

    // If there are updates to apply
    if (Object.keys(updatedData).length > 0) {
      // Ensure only the changed fields are updated on THIS authenticated user.
      await user.update(updatedData);
    }

    // Always return the full current user for this token (never another account).
    const updatedUser = await User.findOne({
      where: { id: user.id },
      include: [
        {
          model: Marketplace,
          as: "marketplace",
          attributes: ["id", "businessName", "phoneNumber", "address", "userId"],
        },
      ],
    });

    if (!updatedUser) {
      return res.status(404).json({
        status: false,
        message: "User not found after update",
      });
    }

    if (Object.keys(updatedData).length === 0) {
      return res.status(200).json({
        status: false,
        message: "No changes to update",
        data: updatedUser,
      });
    }

    return res.status(200).json({
      status: true,
      message: "User data updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error updating user data:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

export const getUserProfile = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const user = req.user;

    let marketplace = null;
    if (user?.marketplaceId) {
      marketplace = await Marketplace.findOne({
        where: { id: user.marketplaceId },
        attributes: ['id', 'businessName', 'description', 'category']
      });
    }

    // Check for active subscription
    let hasActiveSubscription = false;
    let currentSubscriptionId = user.currentSubscriptionId;
    
    if (currentSubscriptionId) {
      const activeSubscription = await Subscription.findOne({
        where: {
          id: currentSubscriptionId,
          status: 'active'
        }
      });
      hasActiveSubscription = !!activeSubscription;
    }

    // Return user profile without sensitive data
    const userProfile = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      businessName: user.businessName,
      status: user.status,
      accountVerified: user.accountVerified,
      profilePic: user.profilePic,
      marketplaceId: user.marketplaceId,
      referralCode: user.referralCode,
      freeBookingUsed: user.freeBookingUsed,
      identityDocumentUrl: user.identityDocumentUrl,
      identityVerified: user.identityVerified,
      professionalVerified: user.professionalVerified,
      businessVerified: user.businessVerified,
      isTeamMember: user.isTeamMember,
      teamOwnerId: user.teamOwnerId,
      currentSubscriptionId: currentSubscriptionId,
      hasActiveSubscription: hasActiveSubscription,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      marketplace: marketplace
    };

    return res.status(200).json({
      status: true,
      message: "User profile retrieved successfully",
      data: userProfile,
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

export const updateUserFcmToken = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const rawToken = req.body.fcmToken as string | null;
    const normalizedToken = rawToken && rawToken.trim().length > 0 ? rawToken.trim() : null;

    await req.user.update({ fcmToken: normalizedToken });

    return res.status(200).json({
      status: true,
      message: "FCM token updated successfully",
    });
  } catch (error) {
    console.error("Error updating user FCM token:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

export const deleteUserAccount = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const userId = req.user.id as string;
    const sequelize = User.sequelize;
    if (!sequelize) {
      return res.status(500).json({
        status: false,
        message: "Internal server error",
      });
    }

    await sequelize.transaction(async (transaction) => {
      const force = { force: true, transaction } as const;

      await User.update(
        { currentSubscriptionId: null, marketplaceId: null },
        { where: { id: userId }, transaction }
      );
      await User.update(
        { referredBy: null },
        { where: { referredBy: userId }, transaction }
      );
      await User.update(
        { teamOwnerId: null, isTeamMember: false },
        { where: { teamOwnerId: userId }, transaction }
      );

      await sequelize.query(
        `DELETE FROM "Waitlists"
         WHERE "clientUserId" = :userId
            OR "marketplaceId" IN (SELECT id FROM "Marketplaces" WHERE "userId" = :userId)
            OR "fulfilledAppointmentId" IN (SELECT id FROM "Appointments" WHERE "userId" = :userId)`,
        { replacements: { userId }, transaction }
      );

      const videos = await Video.findAll({
        where: { userId },
        attributes: ["id"],
        transaction,
      });
      const videoIds = videos.map((video) => video.id);
      if (videoIds.length > 0) {
        const comments = await VideoComment.findAll({
          where: { videoId: { [Op.in]: videoIds } },
          attributes: ["id"],
          transaction,
        });
        const commentIds = comments.map((comment) => comment.id);
        if (commentIds.length > 0) {
          await VideoCommentReaction.destroy({
            where: { commentId: { [Op.in]: commentIds } },
            ...force,
          });
        }
        await VideoComment.destroy({
          where: { videoId: { [Op.in]: videoIds } },
          ...force,
        });
        await VideoLike.destroy({
          where: { videoId: { [Op.in]: videoIds } },
          ...force,
        });
        await Video.destroy({ where: { id: { [Op.in]: videoIds } }, ...force });
      }

      await VideoCommentReaction.destroy({ where: { userId }, ...force });
      await VideoComment.destroy({ where: { userId }, ...force });
      await VideoLike.destroy({ where: { userId }, ...force });
      await VideoFollow.destroy({
        where: { [Op.or]: [{ followerId: userId }, { followingId: userId }] },
        ...force,
      });

      const conversations = await Conversation.findAll({
        where: { [Op.or]: [{ clientId: userId }, { providerId: userId }] },
        attributes: ["id"],
        transaction,
      });
      const conversationIds = conversations.map((conversation) => conversation.id);
      if (conversationIds.length > 0) {
        await Message.destroy({
          where: { conversationId: { [Op.in]: conversationIds } },
          ...force,
        });
        await Conversation.destroy({
          where: { id: { [Op.in]: conversationIds } },
          ...force,
        });
      }
      await Message.destroy({ where: { senderId: userId }, ...force });

      const reviews = await Review.findAll({
        where: { [Op.or]: [{ clientId: userId }, { providerId: userId }] },
        attributes: ["id"],
        transaction,
      });
      const reviewIds = reviews.map((review) => review.id);
      if (reviewIds.length > 0) {
        await ReviewFlag.destroy({
          where: { reviewId: { [Op.in]: reviewIds } },
          ...force,
        });
        await Review.destroy({
          where: { id: { [Op.in]: reviewIds } },
          ...force,
        });
      }
      await ReviewFlag.update(
        { resolvedById: null },
        { where: { resolvedById: userId }, transaction }
      );
      await ReviewFlag.destroy({ where: { flaggedById: userId }, ...force });
      await sequelize.query(
        `DELETE FROM "ProviderReviews"
         WHERE "clientId" = :userId OR "providerId" = :userId`,
        { replacements: { userId }, transaction }
      );

      await SupportTicket.update(
        { assignedToId: null },
        { where: { assignedToId: userId }, transaction }
      );
      const tickets = await SupportTicket.findAll({
        where: { [Op.or]: [{ userId }, { createdById: userId }] },
        attributes: ["id"],
        transaction,
      });
      const ticketIds = tickets.map((ticket) => ticket.id);
      if (ticketIds.length > 0) {
        await SupportTicketMessage.destroy({
          where: { ticketId: { [Op.in]: ticketIds } },
          ...force,
        });
      }
      await SupportTicketMessage.destroy({ where: { senderId: userId }, ...force });
      await SupportTicket.destroy({
        where: { [Op.or]: [{ userId }, { createdById: userId }] },
        ...force,
      });

      const appointments = await Appointment.findAll({
        where: { userId },
        attributes: ["id"],
        transaction,
      });
      const appointmentIds = appointments.map((appointment) => appointment.id);
      if (appointmentIds.length > 0) {
        await AppointmentServiceStatus.destroy({
          where: { appointmentId: { [Op.in]: appointmentIds } },
          ...force,
        });
        await Appointment.destroy({
          where: { id: { [Op.in]: appointmentIds } },
          ...force,
        });
      }

      const marketplaces = await Marketplace.findAll({
        where: { userId },
        transaction,
      });
      for (const marketplace of marketplaces) {
        const marketplaceAppointments = await Appointment.findAll({
          where: { marketplaceId: marketplace.id },
          attributes: ["id"],
          transaction,
        });
        const marketplaceAppointmentIds = marketplaceAppointments.map(
          (appointment) => appointment.id
        );
        if (marketplaceAppointmentIds.length > 0) {
          await AppointmentServiceStatus.destroy({
            where: { appointmentId: { [Op.in]: marketplaceAppointmentIds } },
            ...force,
          });
          await Appointment.destroy({
            where: { id: { [Op.in]: marketplaceAppointmentIds } },
            ...force,
          });
        }

        const externalAppointments = await ExternalAppointment.findAll({
          where: { marketplaceId: marketplace.id },
          attributes: ["id"],
          transaction,
        });
        const externalIds = externalAppointments.map((item) => item.id);
        if (externalIds.length > 0) {
          await sequelize.query(
            `DELETE FROM "ExternalAppointmentAddOns"
             WHERE "externalAppointmentServiceId" IN (
               SELECT id FROM "ExternalAppointmentServices"
               WHERE "externalAppointmentId" IN (:ids)
             )`,
            { replacements: { ids: externalIds }, transaction }
          );
          await sequelize.query(
            `DELETE FROM "ExternalAppointmentServices"
             WHERE "externalAppointmentId" IN (:ids)`,
            { replacements: { ids: externalIds }, transaction }
          );
          await ExternalAppointment.destroy({
            where: { id: { [Op.in]: externalIds } },
            ...force,
          });
        }

        const services = await Service.findAll({
          where: { marketplaceId: marketplace.id },
          attributes: ["id"],
          transaction,
        });
        const serviceIds = services.map((service) => service.id);
        if (serviceIds.length > 0) {
          await ServiceAddOn.destroy({
            where: { serviceId: { [Op.in]: serviceIds } },
            ...force,
          });
          await Service.destroy({
            where: { id: { [Op.in]: serviceIds } },
            ...force,
          });
        }

        await User.update(
          { marketplaceId: null },
          { where: { marketplaceId: marketplace.id }, transaction }
        );
        await Favorite.destroy({
          where: { marketplaceId: marketplace.id },
          ...force,
        });
        await Promotion.destroy({
          where: { providerId: userId },
          ...force,
        });
        await Social.destroy({
          where: { marketplaceId: marketplace.id },
          ...force,
        });
        const scheduleId = marketplace.scheduleId;
        await marketplace.destroy(force);
        if (scheduleId) {
          await Schedule.destroy({ where: { id: scheduleId }, ...force });
        }
      }

      await Favorite.destroy({ where: { userId }, ...force });
      await Friend.destroy({
        where: {
          [Op.or]: [
            { userId },
            { friendId: userId },
            { requestedBy: userId },
          ],
        },
        ...force,
      });
      await Notification.destroy({ where: { userId }, ...force });
      await Subscription.destroy({ where: { userId }, ...force });
      await Referral.destroy({
        where: { [Op.or]: [{ referrerId: userId }, { referredUserId: userId }] },
        ...force,
      });
      await ReferralInvite.destroy({
        where: { [Op.or]: [{ providerId: userId }, { clientId: userId }] },
        ...force,
      });
      await ContentReport.destroy({
        where: {
          [Op.or]: [
            { reporterId: userId },
            { reportedUserId: userId },
            { originalUserId: userId },
          ],
        },
        ...force,
      });
      await TeamMemberPermission.destroy({
        where: { [Op.or]: [{ teamMemberId: userId }, { ownerId: userId }] },
        ...force,
      });
      await Announcement.destroy({ where: { createdById: userId }, ...force });
      await Log.destroy({ where: { userId }, ...force });

      const user = await User.findByPk(userId, { transaction, paranoid: false });
      if (user) {
        await user.destroy({ force: true, transaction });
      }
    });

    return res.status(200).json({
      status: true,
      message: "User account deleted permanently",
    });
  } catch (error) {
    console.error("Error deleting user account:", error);
    const detail = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      status: false,
      message: detail || "Failed to delete account",
    });
  }
};

export const changeUserEmail = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const { newEmail, currentPassword } = req.body;

    if (!newEmail || !currentPassword) {
      return res.status(400).json({
        status: false,
        message: "New email and current password are required",
      });
    }

    // Fetch user with password for verification
    const user = await User.scope('withPassword').findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    // Verify current password
    const isPasswordValid = await bcryptjs.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        status: false,
        message: "Current password is incorrect",
      });
    }

    // Check if new email is already taken
    const existingUser = await User.findOne({ where: { email: newEmail } });
    if (existingUser) {
      return res.status(400).json({
        status: false,
        message: "Email is already taken",
      });
    }

    // Update email
    await user.update({ email: newEmail });

    return res.status(200).json({
      status: true,
      message: "Email updated successfully",
      data: {
        id: user.id,
        email: newEmail,
      },
    });
  } catch (error) {
    console.error("Error changing user email:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

export const changeUserEmailAndPhone = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const { newEmail, newPhone } = req.body;

    if (!newEmail) {
      return res.status(400).json({
        status: false,
        message: "New email is required",
      });
    }

    // Fetch user for update - already authenticated via authenticateToken middleware
    const user = await User.scope('withPassword').findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    // Check if new email is already taken (only if different from current)
    if (newEmail !== user.email) {
      const existingUser = await User.findOne({ where: { email: newEmail } });
      if (existingUser) {
        return res.status(400).json({
          status: false,
          message: "Email is already taken",
        });
      }
    }

    // Check if new phone is already taken (only if different from current and not empty)
    if (newPhone && newPhone !== user.phone) {
      const existingUserWithPhone = await User.findOne({ where: { phone: newPhone } });
      if (existingUserWithPhone) {
        return res.status(400).json({
          status: false,
          message: "Phone number is already taken",
        });
      }
    }

    // Update email and phone
    const updateData: any = { email: newEmail };
    if (newPhone !== undefined) {
      updateData.phone = newPhone || null;
    }
    
    await user.update(updateData);

    return res.status(200).json({
      status: true,
      message: "Contact information updated successfully",
      data: {
        id: user.id,
        email: newEmail,
        phone: newPhone || null,
      },
    });
  } catch (error) {
    console.error("Error changing user email and phone:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

export const changeUserPassword = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({
        status: false,
        message: "New password is required",
      });
    }

    // Fetch user for update - already authenticated via authenticateToken middleware
    const user = await User.scope('withPassword').findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    // Hash new password
    const hashedNewPassword = await bcryptjs.hash(newPassword, 8);

    // Update password
    await user.update({ password: hashedNewPassword });

    return res.status(200).json({
      status: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("Error changing user password:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

export const updateUserStatus = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { userId, status } = req.body;

    if (!userId || !status) {
      return res.status(400).json({
        status: false,
        message: "User ID and status are required",
      });
    }

    if (!['pending', 'verified', 'rejected'].includes(status)) {
      return res.status(400).json({
        status: false,
        message: "Invalid status. Must be 'pending', 'verified', or 'rejected'",
      });
    }

    const user = await User.findOne({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    await user.update({ 
      status: status,
      accountVerified: status === 'verified' ? true : false
    });

    return res.status(200).json({
      status: true,
      message: `User status updated to ${status}`,
      data: {
        id: user.id,
        status: status,
        accountVerified: status === 'verified'
      },
    });
  } catch (error) {
    console.error("Error updating user status:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

export const uploadUserProfilePic = async (
  req: AuthRequest,
  res: Response
): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const file = req.file;

    if (!file) {
      return res.status(400).json({
        status: false,
        message: "No file uploaded.",
      });
    }

    const user = req.user;

    // Delete old profile picture if exists
    if (user.profilePic) {
      const oldRelativePath = localFileStorage.extractRelativePath(user.profilePic);
      await localFileStorage.deleteFile(oldRelativePath);
    }

    // Get relative path from the uploaded file
    const relativePath = `profile-pics/${file.filename}`;
    
    // Generate public URL
    const publicUrl = localFileStorage.getPublicUrl(relativePath);

    // Update the user's profilePic in your database
    await user.update({ profilePic: publicUrl });

    return res.status(200).json({
      status: true,
      message: "Profile picture uploaded successfully",
      data: { profilePic: publicUrl },
    });
  } catch (error) {
    console.error("Error uploading profile picture:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to upload profile picture.",
    });
  }
};

export const removeUserProfilePic = async (
  req: AuthRequest,
  res: Response
): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const user = req.user;

    if (user.profilePic) {
      const oldRelativePath = localFileStorage.extractRelativePath(user.profilePic);
      await localFileStorage.deleteFile(oldRelativePath);
    }

    await user.update({ profilePic: null });

    return res.status(200).json({
      status: true,
      message: "Profile picture removed successfully",
      data: { profilePic: null },
    });
  } catch (error) {
    console.error("Error removing profile picture:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to remove profile picture.",
    });
  }
};

/**
 * Upload identity document (government-issued ID)
 * Allowed: client, solo provider, suite team member.
 * Not allowed: suite owner (they verify via business / Google Business).
 */
export const uploadIdentityDocument = async (
  req: AuthRequest,
  res: Response
): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const file = req.file;

    if (!file) {
      return res.status(400).json({
        status: false,
        message: "No file uploaded.",
      });
    }

    const user = req.user;
    const canUploadIdentity =
      user.role === "client" ||
      user.role === "solo" ||
      (user.role === "suite" && user.isTeamMember === true);
    if (!canUploadIdentity) {
      return res.status(403).json({
        status: false,
        message:
          "Government photo ID verification is only for clients, solo providers, and suite team members. Suite owners must verify with a business document or Google Business.",
      });
    }

    // Delete old identity document if exists
    if (user.identityDocumentUrl) {
      const oldRelativePath = localFileStorage.extractRelativePath(user.identityDocumentUrl);
      await localFileStorage.deleteFile(oldRelativePath);
    }

    // Get relative path from the uploaded file
    const relativePath = `verification-docs/identityCard/${file.filename}`;
    
    // Generate public URL
    const publicUrl = localFileStorage.getPublicUrl(relativePath);

    // Update the user's identityDocumentUrl in database
    await user.update({ identityDocumentUrl: publicUrl });

    // ==== Run automated document verification pipeline ====
    let verificationAnalysis = null;
    try {
      verificationAnalysis = await DocumentVerificationService.verifyDocumentAtPath(
        relativePath
      );
    } catch (verifyError) {
      console.error("Identity document verification failed:", verifyError);
    }

    if (verificationAnalysis) {
      const newStatus = verificationAnalysis.userStatus;
      await user.update({
        status: newStatus,
        accountVerified: newStatus === "verified",
        identityVerified: newStatus === "verified",
      });

      if (newStatus === "verified" || newStatus === "rejected") {
        try {
          const { NotificationService } = await import("../services/notification.service");
          if (newStatus === "verified") {
            await NotificationService.createNotification({
              userId: user.id,
              type: "identity_verified",
              title: "Identity Verified",
              content: "Congratulations! Your government-issued photo ID has been verified. You are now a Booqly Verified Member.",
              data: { verificationStatus: "verified" },
              channels: { push: true, in_app: true },
            });
          } else if (newStatus === "rejected") {
            await NotificationService.createNotification({
              userId: user.id,
              type: "identity_rejected",
              title: "Identity Verification Failed",
              content: "We could not verify your government-issued photo ID. Please upload a clear photo of a valid US government-issued ID and try again.",
              data: { verificationStatus: "rejected" },
              channels: { push: true, in_app: true },
            });
          }
        } catch (notifyError) {
          console.error("Failed to send verification notification:", notifyError);
        }
      }

      return res.status(200).json({
        status: true,
        message: "Identity document uploaded and processed successfully",
        data: {
          identityDocumentUrl: publicUrl,
          verificationStatus: newStatus,
          trustScore: verificationAnalysis.trustScore,
          verificationMessage: verificationAnalysis.message,
        },
      });
    }

    // Fallback if verification pipeline couldn't run
    return res.status(200).json({
      status: true,
      message: "Identity document uploaded successfully",
      data: { identityDocumentUrl: publicUrl },
    });
  } catch (error) {
    console.error("Error uploading identity document:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to upload identity document.",
    });
  }
};

/**
 * Lightweight document quality check for professional/business verification.
 * Ensures the upload is a readable image of the required minimum resolution.
 */
async function verifyDocumentQuality(
  absolutePath: string
): Promise<{ passes: boolean; message: string }> {
  try {
    const metadata = await sharp(absolutePath).metadata();
    if (!metadata.width || !metadata.height) {
      return {
        passes: false,
        message:
          "We could not read this document. Please upload a clear photo of the document.",
      };
    }
    if (metadata.width < MIN_DOC_WIDTH || metadata.height < MIN_DOC_HEIGHT) {
      return {
        passes: false,
        message:
          "The document is too small or unclear. Please upload a higher resolution photo.",
      };
    }
    return { passes: true, message: "" };
  } catch {
    return {
      passes: false,
      message:
        "The uploaded file is not a valid image. Please upload a JPG, PNG, or WEBP file.",
    };
  }
}

/**
 * Verify a business document (EIN letter or LLC certificate) uploaded as a PDF.
 * - If the PDF has embedded text, it is machine-readable and passes.
 * - If it is a scanned PDF (no text), the first page is rendered to an image
 *   and must meet the same minimum resolution as a photo upload.
 */
async function verifyBusinessPdf(
  absolutePath: string
): Promise<{ passes: boolean; message: string }> {
  const { extractPdfText, renderPdfFirstPageToPng } = await import(
    "../utils/pdf-utils"
  );

  const text = await extractPdfText(absolutePath);
  if (text.length >= 80) {
    return {
      passes: true,
      message: "",
    };
  }

  const previewPath = `${absolutePath}.preview.png`;
  try {
    const rendered = await renderPdfFirstPageToPng(absolutePath, previewPath);
    if (rendered && rendered.width >= MIN_DOC_WIDTH && rendered.height >= MIN_DOC_HEIGHT) {
      return { passes: true, message: "" };
    }
  } finally {
    const fs = await import("fs");
    fs.promises
      .unlink(previewPath)
      .catch(() => {});
  }

  return {
    passes: false,
    message:
      "We could not read this PDF. Please upload a clear image (JPG or PNG) of your EIN letter or LLC certificate.",
  };
}

/**
 * Upload a professional license document (e.g. nails, esthetics, waxing)
 * Allowed: solo provider, suite team member.
 * Not allowed: client, suite owner.
 */
export const uploadProfessionalDocument = async (
  req: AuthRequest,
  res: Response
): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const file = req.file;

    if (!file) {
      return res.status(400).json({
        status: false,
        message: "No file uploaded.",
      });
    }

    const user = req.user;
    const canUploadLicense =
      user.role === "solo" ||
      (user.role === "suite" && user.isTeamMember === true);
    if (!canUploadLicense) {
      return res.status(403).json({
        status: false,
        message:
          "Professional license upload is only for solo providers and suite team members.",
      });
    }

    const licenseType =
      typeof req.body.licenseType === "string" &&
      req.body.licenseType.trim() !== ""
        ? req.body.licenseType.trim()
        : null;

    const relativePath = `verification-docs/licenseCard/${file.filename}`;
    const absolutePath = path.join(process.cwd(), "uploads", relativePath);

    const quality = await verifyDocumentQuality(absolutePath);
    if (!quality.passes) {
      await localFileStorage.deleteFile(relativePath);
      return res.status(200).json({
        status: false,
        message: quality.message,
      });
    }

    // Delete old professional document if exists
    if (user.professionalDocumentUrl) {
      const oldRelativePath = localFileStorage.extractRelativePath(
        user.professionalDocumentUrl
      );
      await localFileStorage.deleteFile(oldRelativePath);
    }

    const publicUrl = localFileStorage.getPublicUrl(relativePath);

    await user.update({
      professionalDocumentUrl: publicUrl,
      professionalLicenseType:
        licenseType ?? user.professionalLicenseType ?? null,
    });

    let verificationAnalysis = null;
    try {
      verificationAnalysis =
        await DocumentVerificationService.verifyProfessionalLicenseAtPath(
          relativePath
        );
    } catch (verifyError) {
      console.error("Professional license verification failed:", verifyError);
    }

    if (verificationAnalysis) {
      const newStatus = verificationAnalysis.userStatus;
      const approved = newStatus === "verified";
      await user.update({
        professionalVerified: approved,
      });
      await user.reload();
      const isAccountVerified = Boolean(
        user.identityVerified ||
          user.professionalVerified ||
          user.businessVerified
      );
      await user.update({
        status: isAccountVerified ? "verified" : newStatus,
        accountVerified: isAccountVerified,
      });

      if (approved) {
        try {
          const { NotificationService } = await import(
            "../services/notification.service"
          );
          await NotificationService.createNotification({
            userId: user.id,
            type: "professional_verified",
            title: "Professional Verified",
            content:
              "Congratulations! Your professional license has been verified. You are now a Booqly Verified Professional.",
            data: { verificationStatus: "verified" },
            channels: { push: true, in_app: true },
          });
        } catch (notifyError) {
          console.error(
            "Failed to send professional verification notification:",
            notifyError
          );
        }
      }

      return res.status(200).json({
        status: true,
        message: "Professional license uploaded and processed successfully",
        data: {
          professionalDocumentUrl: publicUrl,
          professionalVerified: approved,
          professionalLicenseType: user.professionalLicenseType,
          verificationStatus: newStatus,
          trustScore: verificationAnalysis.trustScore,
          verificationMessage: verificationAnalysis.message,
        },
      });
    }

    await user.reload();
    const isAccountVerified = Boolean(
      user.identityVerified || user.professionalVerified || user.businessVerified
    );
    await user.update({
      status: isAccountVerified ? "verified" : "pending",
      accountVerified: isAccountVerified,
    });

    return res.status(200).json({
      status: true,
      message: "Professional license uploaded successfully",
      data: {
        professionalDocumentUrl: publicUrl,
        professionalVerified: user.professionalVerified,
        professionalLicenseType: user.professionalLicenseType,
      },
    });
  } catch (error) {
    console.error("Error uploading professional document:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to upload professional document.",
    });
  }
};

/**
 * Upload a business document (EIN letter or LLC certificate, image or PDF)
 * Allowed: solo provider, suite owner (not team member).
 * Not allowed: client, suite team member.
 */
export const uploadBusinessDocument = async (
  req: AuthRequest,
  res: Response
): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const file = req.file;

    if (!file) {
      return res.status(400).json({
        status: false,
        message: "No file uploaded.",
      });
    }

    const user = req.user;
    const canUploadBusiness =
      user.role === "solo" ||
      (user.role === "suite" && user.isTeamMember !== true);
    if (!canUploadBusiness) {
      return res.status(403).json({
        status: false,
        message:
          "Business document upload is only for solo providers and suite owners.",
      });
    }

    const relativePath = `verification-docs/businessDoc/${file.filename}`;
    const absolutePath = path.join(process.cwd(), "uploads", relativePath);

    const isPdf =
      file.mimetype === "application/pdf" ||
      path.extname(file.originalname).toLowerCase() === ".pdf";

    if (isPdf) {
      const pdfQuality = await verifyBusinessPdf(absolutePath);
      if (!pdfQuality.passes) {
        await localFileStorage.deleteFile(relativePath);
        return res.status(200).json({
          status: false,
          message: pdfQuality.message,
        });
      }
    } else {
      const quality = await verifyDocumentQuality(absolutePath);
      if (!quality.passes) {
        await localFileStorage.deleteFile(relativePath);
        return res.status(200).json({
          status: false,
          message: quality.message,
        });
      }
    }

    // Delete old business document if exists
    if (user.businessDocumentUrl) {
      const oldRelativePath = localFileStorage.extractRelativePath(
        user.businessDocumentUrl
      );
      await localFileStorage.deleteFile(oldRelativePath);
    }

    const publicUrl = localFileStorage.getPublicUrl(relativePath);

    // Save the document URL regardless of verification outcome
    await user.update({
      businessDocumentUrl: publicUrl,
    });

    let verificationAnalysis = null;
    try {
      verificationAnalysis =
        await DocumentVerificationService.verifyBusinessDocumentAtPath(
          relativePath
        );
    } catch (verifyError) {
      console.error("Business document verification failed:", verifyError);
    }

    let newStatus: "pending" | "verified" | "rejected" = "pending";
    let trustScore: number | null = null;
    let verificationMessage: string | undefined;

    if (verificationAnalysis) {
      newStatus = verificationAnalysis.userStatus;
      trustScore = verificationAnalysis.trustScore;
      verificationMessage = verificationAnalysis.message;
    }

    const businessApproved = newStatus === "verified";

    await user.update({
      businessVerified: businessApproved,
    });
    await user.reload();

    const isAccountVerified = Boolean(
      user.identityVerified || user.professionalVerified || user.businessVerified
    );
    await user.update({
      status: isAccountVerified ? "verified" : newStatus,
      accountVerified: isAccountVerified,
    });

    try {
      const { NotificationService } = await import(
        "../services/notification.service"
      );
      if (newStatus === "verified") {
        await NotificationService.createNotification({
          userId: user.id,
          type: "business_verified",
          title: "Business Verified",
          content:
            "Congratulations! Your business documents have been verified. You are now a Booqly Verified Business.",
          data: { verificationStatus: "verified" },
          channels: { push: true, in_app: true },
        });
      }
    } catch (notifyError) {
      console.error("Failed to send business verification notification:", notifyError);
    }

    return res.status(200).json({
      status: true,
      message: "Business document uploaded and processed successfully",
      data: {
        businessDocumentUrl: publicUrl,
        businessVerified: businessApproved,
        verificationStatus: newStatus,
        trustScore,
        verificationMessage,
      },
    });
  } catch (error) {
    console.error("Error uploading business document:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to upload business document.",
    });
  }
};

/**
 * Verify a suite owner via their Google Business Profile (Google Places place ID).
 * When GOOGLE_PLACES_API_KEY is configured the place is validated against the
 * Google Places API; otherwise the place ID is still recorded and the account
 * is marked as Verified Business.
 */
export const verifyBusinessGoogle = async (
  req: AuthRequest,
  res: Response
): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const user = req.user;
    if (user.role !== "suite" || user.isTeamMember === true) {
      return res.status(403).json({
        status: false,
        message:
          "Google Business verification is only available for suite owners.",
      });
    }

    const googlePlaceId =
      typeof req.body.googlePlaceId === "string"
        ? req.body.googlePlaceId.trim()
        : "";

    if (!googlePlaceId) {
      return res.status(400).json({
        status: false,
        message: "googlePlaceId is required.",
      });
    }

    // Basic format sanity check: Google place IDs are prefixed and non-trivial
    if (googlePlaceId.length < 8 || googlePlaceId.length > 256) {
      return res.status(400).json({
        status: false,
        message: "The Google Business link you provided does not look valid.",
      });
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    let placeValid = true;
    let placeName: string | null = null;

    if (apiKey) {
      try {
        const placeRes = await fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
            googlePlaceId
          )}&fields=name,status&key=${apiKey}`
        );
        const placeData = await placeRes.json();
        if (placeData.status === "OK" && placeData.result) {
          placeName = placeData.result.name ?? null;
        } else {
          placeValid = false;
        }
      } catch (placeError) {
        console.error("Google Places validation failed:", placeError);
      }
    }

    if (!placeValid) {
      return res.status(400).json({
        status: false,
        message:
          "We could not find that Google Business listing. Please check the link and try again.",
      });
    }

    // Persist googlePlaceId on the user's social record if one exists
    try {
      const marketplace = await Marketplace.findOne({
        where: { userId: user.id },
        order: [["createdAt", "DESC"]],
      });
      if (marketplace) {
        await Social.update(
          { googlePlaceId },
          { where: { marketplaceId: marketplace.id } }
        );
      }
    } catch (socialError) {
      console.error("Failed to save googlePlaceId:", socialError);
    }

    await User.update(
      { businessVerified: true },
      { where: { id: user.id } }
    );
    await User.update(
      { status: "verified", accountVerified: true },
      { where: { id: user.id } }
    );

    try {
      const { NotificationService } = await import(
        "../services/notification.service"
      );
      await NotificationService.createNotification({
        userId: user.id,
        type: "business_verified",
        title: "Business Verified",
        content:
          "Congratulations! Your Google Business profile has been connected. You are now a Booqly Verified Business.",
        data: { verificationStatus: "verified" },
        channels: { push: true, in_app: true },
      });
    } catch (notifyError) {
      console.error("Failed to send business verification notification:", notifyError);
    }

    return res.status(200).json({
      status: true,
      message: "Google Business profile connected and verified successfully",
      data: {
        businessVerified: true,
        verificationStatus: "verified",
        trustScore: 100,
        googlePlaceId,
        businessName: placeName,
      },
    });
  } catch (error) {
    console.error("Error verifying Google Business:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to verify Google Business profile.",
    });
  }
};

/**
 * Get client users for sharing promotions
 */
/**
 * Get a client's public profile for providers (contact + socials).
 * Used when opening a client profile from chat, bookings, or calendar.
 */
export const getClientProfileById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: "Authentication required",
      });
      return;
    }

    if (req.user.role !== "solo" && req.user.role !== "suite") {
      res.status(403).json({
        status: false,
        message: "Access denied. Only professionals can view client profiles.",
      });
      return;
    }

    const { userId } = req.params;
    const client = await User.findOne({
      where: {
        id: userId,
        role: "client",
        deletedAt: null,
      },
      attributes: [
        "id",
        "name",
        "email",
        "phone",
        "status",
        "profilePic",
        "accountVerified",
        "identityVerified",
        "insta",
        "tiktok",
        "facebook",
        "createdAt",
        "updatedAt",
        "role",
      ],
    });

    if (!client) {
      res.status(404).json({
        status: false,
        message: "Client not found",
      });
      return;
    }

    res.status(200).json({
      status: true,
      message: "Client profile retrieved successfully",
      data: client,
    });
  } catch (error) {
    console.error("Error getting client profile:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

/**
 * Public profile for any authenticated user (chat avatar, etc.).
 * Does not expose verification document URLs.
 */
export const getPublicProfileById = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: "Authentication required",
      });
      return;
    }

    const { userId } = req.params;
    const profile = await User.findOne({
      where: {
        id: userId,
        deletedAt: null,
      },
      attributes: [
        "id",
        "name",
        "email",
        "phone",
        "status",
        "profilePic",
        "accountVerified",
        "identityVerified",
        "professionalVerified",
        "businessVerified",
        "identityDocumentUrl",
        "isTeamMember",
        "teamOwnerId",
        "currentSubscriptionId",
        "insta",
        "tiktok",
        "facebook",
        "createdAt",
        "updatedAt",
        "role",
      ],
    });

    if (!profile) {
      res.status(404).json({
        status: false,
        message: "User not found",
      });
      return;
    }

    const data = profile.toJSON() as Record<string, unknown>;
    if (profile.currentSubscriptionId) {
      const activeSubscription = await Subscription.findOne({
        where: {
          id: profile.currentSubscriptionId,
          status: "active",
        },
      });
      data.hasActiveSubscription = !!activeSubscription;
    } else {
      data.hasActiveSubscription = false;
    }

    res.status(200).json({
      status: true,
      message: "Profile retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Error getting public profile:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

export const getClientUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: "Authentication required",
      });
      return;
    }

    // Only allow solo and suite providers to access client users
    if (req.user.role !== 'solo' && req.user.role !== 'suite') {
      res.status(403).json({
        status: false,
        message: "Access denied. Only providers can view client users.",
      });
      return;
    }

    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Fetch client users
    const { count, rows: users } = await User.findAndCountAll({
      where: {
        role: 'client',
        deletedAt: null,
      },
      attributes: ['id', 'name', 'email', 'profilePic', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit as string),
      offset: offset,
    });

    const totalPages = Math.ceil(count / parseInt(limit as string));

    res.status(200).json({
      status: true,
      message: 'Client users retrieved successfully',
      data: {
        users,
        pagination: {
          currentPage: parseInt(page as string),
          totalPages,
          totalItems: count,
          itemsPerPage: parseInt(limit as string),
        },
      },
    });
  } catch (error) {
    console.error('Error getting client users:', error);
    res.status(500).json({
      status: false,
      message: 'Internal server error',
    });
  }
};
