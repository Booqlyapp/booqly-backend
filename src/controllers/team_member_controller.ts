import { Response } from "express";
import bcryptjs from "bcryptjs";
import { User } from "../models/user_model";
import { TeamMemberPermission } from "../models/team_member_permission_model";
import { localFileStorage } from "../utils/local-storage";

const ensureSuiteOwner = (user: User, res: Response): boolean => {
  if (user.role !== "suite" || user.isTeamMember) {
    res.status(403).json({
      status: false,
      message: "Only suite owners can manage team members.",
    });
    return false;
  }

  return true;
};

export const createTeamMember = async (req: any, res: Response): Promise<Response> => {
  try {
    const owner = req.user as User;
    if (!owner || !ensureSuiteOwner(owner, res)) {
      return res;
    }

    const {
      name,
      email,
      password,
      phone,
      jobTitle,
      employmentStartDate,
      employmentEndDate,
    } = req.body;

    if (!owner.marketplaceId) {
      return res.status(400).json({
        status: false,
        message: "Suite owner must complete marketplace setup before adding team members.",
      });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({
        status: false,
        message: "User with this email already exists.",
      });
    }

    const hashPass = await bcryptjs.hash(password, 8);

    const teamMember = await User.create({
      name,
      email,
      password: hashPass,
      phone: phone || null,
      role: "suite",
      businessName: owner.businessName,
      marketplaceId: owner.marketplaceId,
      accountVerified: true,
      status: "verified",
      isTeamMember: true,
      teamOwnerId: owner.id,
      jobTitle: jobTitle || null,
      employmentStartDate: employmentStartDate ? new Date(employmentStartDate) : null,
      employmentEndDate: employmentEndDate ? new Date(employmentEndDate) : null,
      freeBookingUsed: false,
    });

    const createdMember = await User.findByPk(teamMember.id);

    return res.status(201).json({
      status: true,
      message: "Team member created successfully.",
      data: createdMember,
    });
  } catch (error: any) {
    console.error("Error creating team member:", error);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${error.message || error}`,
    });
  }
};

export const getTeamMembers = async (req: any, res: Response): Promise<Response> => {
  try {
    const owner = req.user as User;
    if (!owner || !ensureSuiteOwner(owner, res)) {
      return res;
    }

    const teamMembers = await User.findAll({
      where: {
        teamOwnerId: owner.id,
        isTeamMember: true,
      },
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      status: true,
      message: "Team members fetched successfully.",
      data: teamMembers,
    });
  } catch (error: any) {
    console.error("Error fetching team members:", error);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${error.message || error}`,
    });
  }
};

export const deleteTeamMember = async (req: any, res: Response): Promise<Response> => {
  try {
    const owner = req.user as User;
    if (!owner || !ensureSuiteOwner(owner, res)) {
      return res;
    }

    const { teamMemberId } = req.params as { teamMemberId?: string };
    if (!teamMemberId) {
      return res.status(400).json({
        status: false,
        message: "teamMemberId is required.",
      });
    }

    const teamMember = await User.findOne({
      where: {
        id: teamMemberId,
        teamOwnerId: owner.id,
        isTeamMember: true,
      },
    });

    if (!teamMember) {
      return res.status(404).json({
        status: false,
        message: "Team member not found.",
      });
    }

    await teamMember.destroy();

    return res.status(200).json({
      status: true,
      message: "Team member removed successfully.",
    });
  } catch (error: any) {
    console.error("Error deleting team member:", error);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${error.message || error}`,
    });
  }
};

export const updateTeamMember = async (req: any, res: Response): Promise<Response> => {
  try {
    const owner = req.user as User;
    if (!owner || !ensureSuiteOwner(owner, res)) {
      return res;
    }

    const { teamMemberId } = req.params as { teamMemberId?: string };
    if (!teamMemberId) {
      return res.status(400).json({
        status: false,
        message: "teamMemberId is required.",
      });
    }

    const teamMember = await User.findOne({
      where: {
        id: teamMemberId,
        teamOwnerId: owner.id,
        isTeamMember: true,
      },
    });

    if (!teamMember) {
      return res.status(404).json({
        status: false,
        message: "Team member not found.",
      });
    }

    const {
      name,
      email,
      password,
      phone,
      jobTitle,
      employmentStartDate,
      employmentEndDate,
    } = req.body;

    if (email && email !== teamMember.email) {
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser && existingUser.id !== teamMember.id) {
        return res.status(409).json({
          status: false,
          message: "User with this email already exists.",
        });
      }
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone || null;
    if (jobTitle !== undefined) updateData.jobTitle = jobTitle || null;
    if (employmentStartDate !== undefined) {
      updateData.employmentStartDate = employmentStartDate
        ? new Date(employmentStartDate)
        : null;
    }
    if (employmentEndDate !== undefined) {
      updateData.employmentEndDate = employmentEndDate
        ? new Date(employmentEndDate)
        : null;
    }

    if (password) {
      updateData.password = await bcryptjs.hash(password, 8);
    }

    await teamMember.update(updateData);

    const updatedMember = await User.findByPk(teamMember.id);

    return res.status(200).json({
      status: true,
      message: "Team member updated successfully.",
      data: updatedMember,
    });
  } catch (error: any) {
    console.error("Error updating team member:", error);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${error.message || error}`,
    });
  }
};

export const uploadTeamMemberProfilePic = async (req: any, res: Response): Promise<Response> => {
  try {
    const owner = req.user as User;
    if (!owner || !ensureSuiteOwner(owner, res)) {
      return res;
    }

    const { teamMemberId } = req.params as { teamMemberId?: string };
    if (!teamMemberId) {
      return res.status(400).json({
        status: false,
        message: "teamMemberId is required.",
      });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({
        status: false,
        message: "No file uploaded.",
      });
    }

    const teamMember = await User.findOne({
      where: {
        id: teamMemberId,
        teamOwnerId: owner.id,
        isTeamMember: true,
      },
    });

    if (!teamMember) {
      return res.status(404).json({
        status: false,
        message: "Team member not found.",
      });
    }

    if (teamMember.profilePic) {
      const oldRelativePath = localFileStorage.extractRelativePath(teamMember.profilePic);
      await localFileStorage.deleteFile(oldRelativePath);
    }

    const relativePath = `profile-pics/${file.filename}`;
    const publicUrl = localFileStorage.getPublicUrl(relativePath);

    await teamMember.update({ profilePic: publicUrl });

    return res.status(200).json({
      status: true,
      message: "Team member profile picture uploaded successfully.",
      data: { profilePic: publicUrl },
    });
  } catch (error: any) {
    console.error("Error uploading team member profile picture:", error);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${error.message || error}`,
    });
  }
};

export const getTeamMemberPermissions = async (req: any, res: Response): Promise<Response> => {
  try {
    const owner = req.user as User;
    if (!owner || !ensureSuiteOwner(owner, res)) {
      return res;
    }

    const { teamMemberId } = req.params as { teamMemberId?: string };
    if (!teamMemberId) {
      return res.status(400).json({
        status: false,
        message: "teamMemberId is required.",
      });
    }

    const teamMember = await User.findOne({
      where: {
        id: teamMemberId,
        teamOwnerId: owner.id,
        isTeamMember: true,
      },
    });

    if (!teamMember) {
      return res.status(404).json({
        status: false,
        message: "Team member not found.",
      });
    }

    let permissions = await TeamMemberPermission.findOne({
      where: {
        teamMemberId,
        ownerId: owner.id,
      },
    });

    if (!permissions) {
      permissions = await TeamMemberPermission.create({
        teamMemberId,
        ownerId: owner.id,
      });
    }

    return res.status(200).json({
      status: true,
      message: "Team member permissions fetched successfully.",
      data: permissions,
    });
  } catch (error: any) {
    console.error("Error fetching team member permissions:", error);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${error.message || error}`,
    });
  }
};

export const updateTeamMemberPermissions = async (req: any, res: Response): Promise<Response> => {
  try {
    const owner = req.user as User;
    if (!owner || !ensureSuiteOwner(owner, res)) {
      return res;
    }

    const { teamMemberId } = req.params as { teamMemberId?: string };
    if (!teamMemberId) {
      return res.status(400).json({
        status: false,
        message: "teamMemberId is required.",
      });
    }

    const teamMember = await User.findOne({
      where: {
        id: teamMemberId,
        teamOwnerId: owner.id,
        isTeamMember: true,
      },
    });

    if (!teamMember) {
      return res.status(404).json({
        status: false,
        message: "Team member not found.",
      });
    }

    const permissionFields: (keyof typeof req.body)[] = [
      "viewBookings",
      "manageTeamMembers",
      "useChat",
      "viewReviewCenter",
      "viewPromotions",
      "viewAnalytics",
      "viewMarketplace",
      "manageSubscription",
      "manageSocialLinks",
      "viewReviews",
      "manageRedeemCodes",
    ];

    const updateData: any = {};
    for (const field of permissionFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    const [permissions, created] = await TeamMemberPermission.findOrCreate({
      where: {
        teamMemberId,
        ownerId: owner.id,
      },
      defaults: {
        teamMemberId,
        ownerId: owner.id,
        ...updateData,
      },
    });

    if (!created) {
      await permissions.update(updateData);
    }

    return res.status(200).json({
      status: true,
      message: "Team member permissions updated successfully.",
      data: permissions,
    });
  } catch (error: any) {
    console.error("Error updating team member permissions:", error);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${error.message || error}`,
    });
  }
};

export const getMyPermissions = async (req: any, res: Response): Promise<Response> => {
  try {
    const user = req.user as User;
    if (!user) {
      return res.status(401).json({
        status: false,
        message: "Unauthorized.",
      });
    }

    if (!user.isTeamMember) {
      return res.status(403).json({
        status: false,
        message: "Only team members can access their own permissions.",
      });
    }

    let permissions = await TeamMemberPermission.findOne({
      where: {
        teamMemberId: user.id,
      },
    });

    if (!permissions) {
      // Return default all-false permissions without creating a record
      return res.status(200).json({
        status: true,
        message: "Team member permissions fetched successfully.",
        data: {
          teamMemberId: user.id,
          ownerId: user.teamOwnerId,
          viewBookings: false,
          manageTeamMembers: false,
          useChat: false,
          viewReviewCenter: false,
          viewPromotions: false,
          viewAnalytics: false,
          viewMarketplace: false,
          manageSubscription: false,
          manageSocialLinks: false,
          viewReviews: false,
          manageRedeemCodes: false,
        },
      });
    }

    return res.status(200).json({
      status: true,
      message: "Team member permissions fetched successfully.",
      data: permissions,
    });
  } catch (error: any) {
    console.error("Error fetching my permissions:", error);
    return res.status(500).json({
      status: false,
      message: `Internal server error: ${error.message || error}`,
    });
  }
};
