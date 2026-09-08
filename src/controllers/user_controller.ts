import { Request, Response } from "express";
import { User } from "../models/user_model";
import { Marketplace } from "../models/marketplace_model";
import { Subscription } from "../models/subscription_model";
import { localFileStorage } from "../utils/local-storage";
import { DocumentVerificationService } from "../services/document-verification.service";
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

    // Only update businessName if it's different from the current businessName
    if (businessName !== undefined && businessName !== user.businessName) {
      // Validate businessName is required for non-client roles
      if (user.role !== 'client' && (!businessName || businessName.trim() === '')) {
        return res.status(400).json({
          status: false,
          message: "Business name is required for solo professionals and suite owners",
        });
      }
      updatedData.businessName = businessName ? businessName.trim() : null;
    }

    // If there are updates to apply
    if (Object.keys(updatedData).length > 0) {
      // Ensure only the changed fields are updated
      await user.update(updatedData);
      // Fetch updated user data
      const updatedUser = await User.findOne({ where: { id: user.id } });
      return res.status(200).json({
        status: true,
        message: "User data updated successfully",
        data: {
          id: updatedUser?.id,
          name: updatedUser?.name,
          email: updatedUser?.email,
          phone: updatedUser?.phone,
          role: updatedUser?.role,
          businessName: updatedUser?.businessName,
          profilePic: updatedUser?.profilePic,
          accountVerified: updatedUser?.accountVerified,
          createdAt: updatedUser?.createdAt,
          updatedAt: updatedUser?.updatedAt
        },
      });
    }

    // No changes to update
    return res.status(200).json({
      status: false,
      message: "No changes to update",
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

    const user = req.user;

    // Soft delete the user
    await user.destroy();

    return res.status(200).json({
      status: true,
      message: "User account deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user account:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
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
