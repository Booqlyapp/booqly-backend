import { Response } from "express";
import { User } from "../models/user_model";
import { genericSignedUrl } from "./signed_controller";
import { Marketplace } from "../models/marketplace_model";
import { Schedule } from "../models/schedule_model";
import { Service } from "../models/service_model";
import { Social } from "../models/social_model";
import { PasswordResetService } from "../services/password_reset.service";
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");

const generateToken = async (payload: any) => {
  return await jwt.sign(payload, process.env.JWT_SECRET_KEY, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

export const registerUser = async (req: any, res: Response): Promise<any> => {
  try {
    // At this point, req.body has already been validated and sanitized by Joi middleware
    const { name, role, email, password, phone, businessName } = req.body;

    const existingUser = await User.findOne({ where: { email } });

    if (existingUser) {
      return res.status(200).json({
        status: false,
        message: "User with this email already exists",
      });
    }

    const hashPass = await bcryptjs.hash(password, 8);

    // Create user data object with role-based verification
    const userData: any = {
      name,
      role,
      email,
      accountVerified: false, // All new users require identity verification
      status: 'pending', // New users start with pending status until their ID is verified
      password: hashPass,
      freeBookingUsed: false,
    };

    // Add phone if provided
    if (phone && phone.trim() !== '') {
      userData.phone = phone.trim();
    }

    // Add businessName if provided (required for non-client roles)
    if (businessName && businessName.trim() !== '') {
      userData.businessName = businessName.trim();
    }

    const newUser = await User.create(userData);

    const token = await generateToken({ id: newUser.id });

    if (!token) {
      return res.status(200).json({
        status: false,
        message: "Failed to create user because of token not created.",
      });
    }

    // Fetch user without password for response (applies defaultScope)
    const userForResponse = await User.findByPk(newUser.id);

    return res.status(201).json({
      status: true,
      message: "Welcome to Booqly",
      token: token,
      data: userForResponse,
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res
      .status(500)
      .json({ status: false, message: "Internal server error" });
  }
};

export const signInUser = async (req: any, res: Response): Promise<any> => {
  try {
    const { email, password, role } = req.body;

    const user = await User.scope('withPassword').findOne({
      where: { email },
      include: [
        {
          model: Marketplace,
          as: "marketplace",
          include: [
            {
              model: Schedule,
              as: "schedule",
            },
            {
              model: Service,
              as: "services",
              attributes: [
                'id', 'name', 'category', 'subcategory', 'categoryId', 'subcategoryId',
                'description', 'price', 'duration', 'marketplaceId', 'isActive',
                'requireDeposit', 'depositType', 'depositAmount',
                'createdAt', 'updatedAt', 'deletedAt'
              ],
            },
            {
              model: Social,
              as: "socials",
            },
          ],
        },
      ],
    });

    if (!user) {
      return res.status(200).json({
        status: false,
        message: "User not found with this email address",
      });
    }

    // Check if the user's role matches the requested role
    if (role && user.role !== role) {
      return res.status(200).json({
        status: false,
        message: `No user found with the provided role and credentials.`,
      });
    }

    const isPasswordMatched = await bcryptjs.compare(password, user.password);

    if (!isPasswordMatched) {
      return res.status(200).json({
        status: false,
        message: "Incorrect Password. Please try again",
      });
    }

    if (user.isSuspended) {
      return res.status(403).json({
        status: false,
        message: "Your account has been suspended. Contact support if you think this is a mistake.",
      });
    }

    const token = await generateToken({
      id: user.id,
    });

    // Fetch user without password for response
    const userForResponse = await User.findOne({
      where: { id: user.id },
      include: [
        {
          model: Marketplace,
          as: "marketplace",
          include: [
            {
              model: Schedule,
              as: "schedule",
            },
            {
              model: Service,
              as: "services",
              attributes: [
                'id', 'name', 'category', 'subcategory', 'categoryId', 'subcategoryId',
                'description', 'price', 'duration', 'marketplaceId', 'isActive',
                'requireDeposit', 'depositType', 'depositAmount',
                'createdAt', 'updatedAt', 'deletedAt'
              ],
            },
            {
              model: Social,
              as: "socials",
            },
          ],
        },
      ],
    });

    if (userForResponse?.profilePic != null) {
      const profilePicSigned = await genericSignedUrl(userForResponse.profilePic);
      userForResponse.profilePic = profilePicSigned;
    }

    return res.status(200).json({
      status: true,
      message: "Welcome back to Booqly",
      token: token,
      data: userForResponse,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ status: false, message: `Internal server error: ${err}` });
  }
};

/**
 * Step 1 of forgot password: generate and email a 6-digit OTP.
 * Always responds the same way whether or not the email is registered,
 * so this endpoint can't be used to enumerate accounts.
 */
export const forgotPassword = async (req: any, res: Response): Promise<any> => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ where: { email } });

    if (user) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedOtp = await bcryptjs.hash(otp, 8);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await user.update({
        passwordResetOtp: hashedOtp,
        passwordResetOtpExpiresAt: expiresAt,
      });

      try {
        await PasswordResetService.sendOtpEmail(user.email, user.name, otp);
      } catch (emailError) {
        console.error("Error sending password reset email:", emailError);
        // Don't leave the user holding a code that never arrived
        await user.update({ passwordResetOtp: null, passwordResetOtpExpiresAt: null });
        return res.status(200).json({
          status: false,
          message: "Failed to send verification code. Please try again later.",
        });
      }
    }

    return res.status(200).json({
      status: true,
      message: "If an account exists with this email, we've sent a verification code.",
    });
  } catch (error) {
    console.error("Error in forgotPassword:", error);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};

/**
 * Step 2 of forgot password: verify the OTP and set a new password.
 */
export const resetPassword = async (req: any, res: Response): Promise<any> => {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.scope("withPassword").findOne({ where: { email } });

    if (!user || !user.passwordResetOtp || !user.passwordResetOtpExpiresAt) {
      return res.status(200).json({
        status: false,
        message: "Invalid or expired verification code.",
      });
    }

    if (new Date() > user.passwordResetOtpExpiresAt) {
      await user.update({ passwordResetOtp: null, passwordResetOtpExpiresAt: null });
      return res.status(200).json({
        status: false,
        message: "Invalid or expired verification code.",
      });
    }

    const isOtpValid = await bcryptjs.compare(otp, user.passwordResetOtp);
    if (!isOtpValid) {
      return res.status(200).json({
        status: false,
        message: "Invalid or expired verification code.",
      });
    }

    const hashedPassword = await bcryptjs.hash(newPassword, 8);
    await user.update({
      password: hashedPassword,
      passwordResetOtp: null,
      passwordResetOtpExpiresAt: null,
    });

    return res.status(200).json({
      status: true,
      message: "Password reset successfully. Please sign in with your new password.",
    });
  } catch (error) {
    console.error("Error in resetPassword:", error);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};

export const userLoggedInOrVerificationStatus = async (
  req: any,
  res: Response
): Promise<any> => {
  try {
    const { token, userId, role } = req.query;

    // Check if neither token nor userId is provided
    if (!token && !userId) {
      return res.status(200).json({
        status: false,
        message: "Token or User ID is required",
      });
    }

    let decodedToken: any;
    let user;

    // If token is provided, decode and fetch user
    if (token) {
      decodedToken = jwt.decode(token);

      if (!decodedToken || !decodedToken.id) {
        return res.status(200).json({
          status: false,
          message: "Invalid or expired token. Please login again",
        });
      }

      user = await User.findOne({
        where: { id: decodedToken.id, role },
        include: [
          {
            model: Marketplace,
            as: "marketplace",
            include: [
              {
                model: Schedule,
                as: "schedule",
              },
              {
                model: Service,
                as: "services",
              },
              {
                model: Social,
                as: "socials",
              },
            ],
          },
        ],
      });
    } else if (userId) {
      // If userId is provided, directly fetch user by userId
      user = await User.findOne({
        where: { id: userId, role },
        include: [
          {
            model: Marketplace,
            as: "marketplace",
            include: [
              {
                model: Schedule,
                as: "schedule",
              },
              {
                model: Service,
                as: "services",
              },
              {
                model: Social,
                as: "socials",
              },
            ],
          },
        ],
      });
    }

    // If user is not found
    if (!user) {
      return res.status(200).json({
        status: false,
        message: "No user found with the provided ID or token",
      });
    }

    if (user.profilePic != null) {
      const profilePicSigned = await genericSignedUrl(user.profilePic);
      user.profilePic = profilePicSigned;
    }

    const userWithAssociations = user as any;
    if (
      userWithAssociations.marketplace &&
      userWithAssociations.marketplace.imagesList &&
      userWithAssociations.marketplace.imagesList.length > 0
    ) {
      const signedImagesList = await Promise.all(
        userWithAssociations.marketplace.imagesList.map(
          async (imageUrl: string) => {
            return await genericSignedUrl(imageUrl);
          }
        )
      );
      userWithAssociations.marketplace.imagesList = signedImagesList;
    }

    // Return user status
    return res.status(200).json({
      status: true,
      message: "User found successfully",
      data: user,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ status: false, message: `Internal server error: ${err}` });
  }
};
