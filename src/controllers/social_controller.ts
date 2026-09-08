import { Request, Response } from "express";
import { Social } from "../models/social_model";
import { User } from "../models/user_model";

const UPDATABLE_FIELDS = ["insta", "tiktok", "facebook", "googlePlaceId"] as const;

// Validation and formatting functions
const validateAndFormatInstagram = (username: string): { isValid: boolean; formatted: string; error?: string } => {
  if (!username || username.trim() === '') {
    return { isValid: true, formatted: '' };
  }
  
  const trimmed = username.trim();
  
  // Remove any URL prefixes if present
  let cleanUsername = trimmed
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
    .replace(/^@/, '')
    .replace(/\/$/, '');
  
  // Instagram username validation: alphanumeric, underscores, periods, 1-30 characters
  const instaRegex = /^[a-zA-Z0-9_.]{1,30}$/;
  
  if (!instaRegex.test(cleanUsername)) {
    return {
      isValid: false,
      formatted: cleanUsername,
      error: 'Invalid Instagram username format. Use only letters, numbers, underscores, and periods (1-30 characters)'
    };
  }
  
  return { isValid: true, formatted: cleanUsername };
};

const validateAndFormatTikTok = (username: string): { isValid: boolean; formatted: string; error?: string } => {
  if (!username || username.trim() === '') {
    return { isValid: true, formatted: '' };
  }
  
  const trimmed = username.trim();
  
  // Remove any URL prefixes if present
  let cleanUsername = trimmed
    .replace(/^https?:\/\/(www\.)?tiktok\.com\//, '')
    .replace(/^@/, '');
  
  // TikTok username validation: alphanumeric, underscores, periods, 2-24 characters
  const tiktokRegex = /^[a-zA-Z0-9_.]{2,24}$/;
  
  if (!tiktokRegex.test(cleanUsername)) {
    return {
      isValid: false,
      formatted: `@${cleanUsername}`,
      error: 'Invalid TikTok username format. Use only letters, numbers, underscores, and periods (2-24 characters)'
    };
  }
  
  return { isValid: true, formatted: `@${cleanUsername}` };
};

export const updateSocialHandle = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { socialId, insta, tiktok, facebook, googlePlaceId } = req.body;

    if (!socialId) {
      return res.status(200).json({
        status: false,
        message: "Please pass a valid social id",
      });
    }

    // Validate and format social media usernames
    const validationErrors: string[] = [];
    const updateData: Partial<
      Record<(typeof UPDATABLE_FIELDS)[number], string>
    > = {};

    if (insta !== undefined) {
      const instaResult = validateAndFormatInstagram(insta);
      if (!instaResult.isValid) {
        validationErrors.push(`Instagram: ${instaResult.error}`);
      } else {
        updateData.insta = instaResult.formatted;
      }
    }

    if (tiktok !== undefined) {
      const tiktokResult = validateAndFormatTikTok(tiktok);
      if (!tiktokResult.isValid) {
        validationErrors.push(`TikTok: ${tiktokResult.error}`);
      } else {
        updateData.tiktok = tiktokResult.formatted;
      }
    }

    if (facebook !== undefined) {
      updateData.facebook = facebook;
    }

    if (googlePlaceId !== undefined) {
      updateData.googlePlaceId = googlePlaceId;
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        status: false,
        message: "Validation errors: " + validationErrors.join(", "),
      });
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(200).json({
        status: false,
        message:
          "No valid fields to update. Provide at least one of: insta, tiktok, facebook, googlePlaceId.",
      });
    }

    const [updatedCount] = await Social.update(updateData, {
      where: { id: socialId, deletedAt: null },
      returning: true,
    });

    if (updatedCount === 0) {
      return res.status(200).json({
        status: false,
        message: "No record found for this social Id or record is deleted.",
      });
    }

    const updatedSocial = await Social.findByPk(socialId);

    return res.status(200).json({
      status: true,
      message: "Social updated successfully",
      data: updatedSocial,
    });
  } catch (error) {
    console.error("Error updating social data:", error);
    return res.status(200).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Update social media handles by marketplace ID (more convenient for frontend)
export const updateMarketplaceSocials = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const { marketplaceId, insta, tiktok, facebook, googlePlaceId } = req.body;

    if (!marketplaceId) {
      return res.status(400).json({
        status: false,
        message: "marketplaceId is required",
      });
    }

    // Verify user owns this marketplace
    const user = req.user;
    if (user.marketplaceId !== marketplaceId) {
      return res.status(403).json({
        status: false,
        message: "You can only update social media for your own marketplace.",
      });
    }

    // Get or create social record for this marketplace
    let social = await Social.findOne({
      where: { marketplaceId: marketplaceId }
    });

    // Validate and format social media usernames
    const validationErrors: string[] = [];
    const updateData: Partial<Record<(typeof UPDATABLE_FIELDS)[number], string | null>> = {};

    if (insta !== undefined) {
      if (insta === null || insta === '') {
        updateData.insta = null;
      } else {
        const instaResult = validateAndFormatInstagram(insta);
        if (!instaResult.isValid) {
          validationErrors.push(`Instagram: ${instaResult.error}`);
        } else {
          updateData.insta = instaResult.formatted;
        }
      }
    }

    if (tiktok !== undefined) {
      if (tiktok === null || tiktok === '') {
        updateData.tiktok = null;
      } else {
        const tiktokResult = validateAndFormatTikTok(tiktok);
        if (!tiktokResult.isValid) {
          validationErrors.push(`TikTok: ${tiktokResult.error}`);
        } else {
          updateData.tiktok = tiktokResult.formatted;
        }
      }
    }

    if (facebook !== undefined) {
      updateData.facebook = facebook || null;
    }

    if (googlePlaceId !== undefined) {
      updateData.googlePlaceId = googlePlaceId || null;
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        status: false,
        message: "Validation errors: " + validationErrors.join(", "),
      });
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        status: false,
        message: "No valid fields to update. Provide at least one of: insta, tiktok, facebook, googlePlaceId.",
      });
    }

    if (social) {
      // Update existing social record
      await social.update(updateData);
    } else {
      // Create new social record
      social = await Social.create({
        marketplaceId: marketplaceId,
        ...updateData,
      });
    }

    return res.status(200).json({
      status: true,
      message: "Social media handles updated successfully",
      data: social,
    });

  } catch (error) {
    console.error("Error updating marketplace social media:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Update client social media handles (stored directly in User model)
export const updateClientSocials = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const { insta, tiktok, facebook } = req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    // Verify user is a client
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    if (user.role !== 'client') {
      return res.status(403).json({
        status: false,
        message: "This endpoint is only for client users. Providers should use marketplace social endpoints.",
      });
    }

    // Validate and format social media usernames
    const validationErrors: string[] = [];
    const updateData: Partial<Record<(typeof UPDATABLE_FIELDS)[number], string | null>> = {};

    if (insta !== undefined) {
      if (insta === null || insta === '') {
        updateData.insta = null;
      } else {
        const instaResult = validateAndFormatInstagram(insta);
        if (!instaResult.isValid) {
          validationErrors.push(`Instagram: ${instaResult.error}`);
        } else {
          updateData.insta = instaResult.formatted;
        }
      }
    }

    if (tiktok !== undefined) {
      if (tiktok === null || tiktok === '') {
        updateData.tiktok = null;
      } else {
        const tiktokResult = validateAndFormatTikTok(tiktok);
        if (!tiktokResult.isValid) {
          validationErrors.push(`TikTok: ${tiktokResult.error}`);
        } else {
          updateData.tiktok = tiktokResult.formatted;
        }
      }
    }

    if (facebook !== undefined) {
      updateData.facebook = facebook || null;
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        status: false,
        message: "Validation errors: " + validationErrors.join(", "),
      });
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        status: false,
        message: "No valid fields to update. Provide at least one of: insta, tiktok, facebook, googlePlaceId.",
      });
    }

    // Update user social fields
    await user.update(updateData);

    // Return updated user with social fields
    const updatedUser = await User.findByPk(userId, {
      attributes: ['id', 'name', 'email', 'role', 'insta', 'tiktok', 'facebook']
    });

    return res.status(200).json({
      status: true,
      message: "Social media handles updated successfully",
      data: {
        socials: {
          insta: updatedUser?.insta,
          tiktok: updatedUser?.tiktok,
          facebook: updatedUser?.facebook,
        }
      },
    });

  } catch (error) {
    console.error("Error updating client social media:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
