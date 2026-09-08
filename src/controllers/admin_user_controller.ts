import { Request, Response } from "express";
import { Op } from "sequelize";
import bcryptjs from "bcryptjs";
import { User } from "../models/user_model";
import { Appointment } from "../models/appointment_model";
import { Marketplace } from "../models/marketplace_model";
import { Service } from "../models/service_model";
import { Social } from "../models/social_model";

interface AuthRequest extends Request {
  user?: any;
  userId?: string;
}

/**
 * List users with pagination, filtering and search (admin only)
 */
export const listUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 20, role, status, search } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    const where: any = {};

    if (role) {
      where.role = role;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      const term = `%${search}%`;
      where[Op.or] = [
        { name: { [Op.iLike]: term } },
        { email: { [Op.iLike]: term } },
        { phone: { [Op.iLike]: term } },
        { businessName: { [Op.iLike]: term } },
      ];
    }

    const { count, rows: users } = await User.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: limitNum,
      offset,
    });

    const totalPages = Math.ceil(count / limitNum);

    res.status(200).json({
      status: true,
      message: "Users retrieved successfully",
      data: {
        users,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: count,
          itemsPerPage: limitNum,
        },
      },
    });
  } catch (error) {
    console.error("Error listing users:", error);
    res.status(500).json({
      status: false,
      message: "Failed to retrieve users",
    });
  }
};

/**
 * Get a single user's information (admin only)
 */
export const getUserByIdAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);

    if (!user) {
      res.status(404).json({
        status: false,
        message: "User not found",
      });
      return;
    }

    res.status(200).json({
      status: true,
      message: "User retrieved successfully",
      data: user,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({
      status: false,
      message: "Failed to retrieve user",
    });
  }
};

/**
 * Update a user's information (admin only)
 */
export const updateUserByAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, email, phone, role, businessName, status, accountVerified, password } = req.body;

    const user = await User.findByPk(id);

    if (!user) {
      res.status(404).json({
        status: false,
        message: "User not found",
      });
      return;
    }

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        res.status(400).json({
          status: false,
          message: "Another user with this email already exists",
        });
        return;
      }
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (role !== undefined) updates.role = role;
    if (businessName !== undefined) updates.businessName = businessName;
    if (status !== undefined) updates.status = status;
    if (accountVerified !== undefined) updates.accountVerified = accountVerified;
    if (password) updates.password = await bcryptjs.hash(password, 8);

    await user.update(updates);

    res.status(200).json({
      status: true,
      message: "User updated successfully",
      data: user,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({
      status: false,
      message: "Failed to update user",
    });
  }
};

/**
 * Get a user's booking history (admin only).
 * - Clients: bookings they made (Appointment.userId = user.id)
 * - Solo/suite providers (and their team members): bookings received on their marketplace (Appointment.marketplaceId = user.marketplaceId)
 */
export const getUserBookingHistoryAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, status } = req.query;

    const pageNum = parseInt(page as string) || 1;
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);
    const offset = (pageNum - 1) * limitNum;

    const user = await User.findByPk(id);

    if (!user) {
      res.status(404).json({
        status: false,
        message: "User not found",
      });
      return;
    }

    const where: any = {};
    if (status) {
      where.status = status;
    }

    let bookingType: "made" | "received";

    if (user.role === "client") {
      bookingType = "made";
      where.userId = user.id;
    } else {
      // solo, suite (owner) and their team members book clients into their marketplace
      bookingType = "received";
      if (!user.marketplaceId) {
        res.status(200).json({
          status: true,
          message: "User has no marketplace associated, so no booking history exists",
          data: {
            bookingType,
            bookings: [],
            pagination: {
              currentPage: pageNum,
              totalPages: 0,
              totalItems: 0,
              itemsPerPage: limitNum,
            },
          },
        });
        return;
      }
      where.marketplaceId = user.marketplaceId;
    }

    const { count, rows: bookings } = await Appointment.findAndCountAll({
      where,
      include: [
        { model: User, as: "user", attributes: ["id", "name", "email", "phone", "profilePic"] },
        {
          model: Marketplace,
          as: "marketplace",
          attributes: ["id", "businessName", "phoneNumber", "address", "latitude", "longitude", "imagesList", "userId"],
          include: [
            {
              model: Social,
              as: "socials",
              attributes: ["id", "insta", "tiktok", "facebook", "googlePlaceId"],
            },
          ],
        },
        {
          model: Service,
          as: "services",
          through: { attributes: [] },
          attributes: ["id", "name", "description", "price", "duration"],
        },
      ],
      limit: limitNum,
      offset,
      order: [["dateTime", "DESC"]],
    });

    const totalPages = Math.ceil(count / limitNum);

    res.status(200).json({
      status: true,
      message: "User booking history retrieved successfully",
      data: {
        bookingType,
        bookings: bookings.map((b) => b.toJSON()),
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: count,
          itemsPerPage: limitNum,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching user booking history:", error);
    res.status(500).json({
      status: false,
      message: "Failed to retrieve user booking history",
    });
  }
};

/**
 * Delete a user (admin only). Soft-deletes by default; pass ?force=true to permanently delete.
 */
export const deleteUserByAdmin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const force = req.query.force === "true";

    if (req.userId && req.userId === id) {
      res.status(400).json({
        status: false,
        message: "You cannot delete your own admin account",
      });
      return;
    }

    const user = await User.findByPk(id);

    if (!user) {
      res.status(404).json({
        status: false,
        message: "User not found",
      });
      return;
    }

    await user.destroy({ force });

    res.status(200).json({
      status: true,
      message: force ? "User permanently deleted" : "User deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({
      status: false,
      message: "Failed to delete user",
    });
  }
};
