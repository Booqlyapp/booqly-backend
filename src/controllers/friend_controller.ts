import { Response } from "express";
import { Op } from "sequelize";
import { AuthRequest } from "../middlewares/auth.middleware";
import { Friend } from "../models/friend_model";
import { User } from "../models/user_model";

// Search for users to add as friends
export const searchUsers = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const { query, page = 1, limit = 20 } = req.query;
    const currentUserId = req.user.id;

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return res.status(400).json({
        status: false,
        message: "Search query must be at least 2 characters long",
      });
    }

    const offset = (Number(page) - 1) * Number(limit);

    // Get existing friend IDs to exclude from search (only active friendships)
    const existingFriends = await Friend.findAll({
      where: {
        [Op.or]: [
          { userId: currentUserId },
          { friendId: currentUserId }
        ]
      },
      attributes: ['userId', 'friendId'],
      paranoid: true // Only include non-deleted records
    });

    const excludeUserIds = [currentUserId];
    existingFriends.forEach(friendship => {
      if (friendship.userId !== currentUserId) {
        excludeUserIds.push(friendship.userId);
      }
      if (friendship.friendId !== currentUserId) {
        excludeUserIds.push(friendship.friendId);
      }
    });

    // Search for users (only clients can have friends)
    const users = await User.findAndCountAll({
      where: {
        [Op.and]: [
          {
            id: {
              [Op.notIn]: excludeUserIds
            }
          },
          {
            role: 'client' // Only clients can be friends
          },
          {
            [Op.or]: [
              {
                name: {
                  [Op.iLike]: `%${query}%`
                }
              },
              {
                email: {
                  [Op.iLike]: `%${query}%`
                }
              }
            ]
          }
        ]
      },
      attributes: ['id', 'name', 'email', 'profilePic', 'createdAt'],
      limit: Number(limit),
      offset: offset,
      order: [['name', 'ASC']]
    });

    return res.status(200).json({
      status: true,
      message: "Users found successfully",
      data: users.rows,
      pagination: {
        total: users.count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(users.count / Number(limit))
      }
    });
  } catch (error) {
    console.error("Error searching users:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Send friend request
export const sendFriendRequest = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const { friendId } = req.body;
    const currentUserId = req.user.id;

    if (!friendId) {
      return res.status(400).json({
        status: false,
        message: "Friend ID is required",
      });
    }

    if (friendId === currentUserId) {
      return res.status(400).json({
        status: false,
        message: "Cannot send friend request to yourself",
      });
    }

    // Check if target user exists and is a client
    const targetUser = await User.findOne({
      where: { 
        id: friendId,
        role: 'client'
      }
    });

    if (!targetUser) {
      return res.status(404).json({
        status: false,
        message: "User not found or not eligible for friendship",
      });
    }

    // Check if friendship already exists (including soft-deleted ones)
    const existingFriendship = await Friend.findOne({
      where: {
        [Op.or]: [
          { userId: currentUserId, friendId: friendId },
          { userId: friendId, friendId: currentUserId }
        ]
      },
      paranoid: false // Include soft-deleted records
    });

    let friendRequest;
    
    if (existingFriendship) {
      // If friendship exists but is soft-deleted, restore and update it
      if (existingFriendship.deletedAt) {
        await existingFriendship.restore();
        await existingFriendship.update({
          userId: currentUserId,
          friendId: friendId,
          status: 'pending',
          requestedBy: currentUserId
        });
        friendRequest = existingFriendship;
      } else {
        // Active friendship already exists
        return res.status(400).json({
          status: false,
          message: "Friendship request already exists",
        });
      }
    } else {
      // Create new friend request
      friendRequest = await Friend.create({
        userId: currentUserId,
        friendId: friendId,
        status: 'pending',
        requestedBy: currentUserId
      });
    }

    // Fetch the created friendship with user details
    const createdFriendship = await Friend.findByPk(friendRequest.id, {
      include: [
        {
          model: User,
          as: 'friend',
          attributes: ['id', 'name', 'email', 'profilePic']
        }
      ]
    });

    return res.status(201).json({
      status: true,
      message: "Friend request sent successfully",
      data: createdFriendship,
    });
  } catch (error) {
    console.error("Error sending friend request:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Get user's friends list
export const getFriends = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const currentUserId = req.user.id;
    const { status = 'accepted', page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const friends = await Friend.findAndCountAll({
      where: {
        [Op.or]: [
          { userId: currentUserId },
          { friendId: currentUserId }
        ],
        status: status as string
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'profilePic']
        },
        {
          model: User,
          as: 'friend',
          attributes: ['id', 'name', 'email', 'profilePic']
        },
        {
          model: User,
          as: 'requester',
          attributes: ['id', 'name']
        }
      ],
      limit: Number(limit),
      offset: offset,
      order: [['createdAt', 'DESC']]
    });

    // Format the response to show the other user in the friendship
    const formattedFriends = friends.rows.map(friendship => {
      const otherUser = friendship.userId === currentUserId ? friendship.friend : friendship.user;
      return {
        id: friendship.id,
        user: otherUser,
        status: friendship.status,
        requestedBy: friendship.requestedBy,
        isRequester: friendship.requestedBy === currentUserId,
        createdAt: friendship.createdAt,
        updatedAt: friendship.updatedAt
      };
    });

    return res.status(200).json({
      status: true,
      message: "Friends retrieved successfully",
      data: formattedFriends,
      pagination: {
        total: friends.count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(friends.count / Number(limit))
      }
    });
  } catch (error) {
    console.error("Error fetching friends:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Accept friend request
export const acceptFriendRequest = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const { friendshipId } = req.params;
    const currentUserId = req.user.id;

    const friendship = await Friend.findOne({
      where: {
        id: friendshipId,
        friendId: currentUserId, // Only the recipient can accept
        status: 'pending'
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'profilePic']
        }
      ]
    });

    if (!friendship) {
      return res.status(404).json({
        status: false,
        message: "Friend request not found or already processed",
      });
    }

    await friendship.update({ status: 'accepted' });

    return res.status(200).json({
      status: true,
      message: "Friend request accepted successfully",
      data: friendship,
    });
  } catch (error) {
    console.error("Error accepting friend request:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Delete friend or reject friend request
export const deleteFriend = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const { friendshipId } = req.params;
    const currentUserId = req.user.id;

    const friendship = await Friend.findOne({
      where: {
        id: friendshipId,
        [Op.or]: [
          { userId: currentUserId },
          { friendId: currentUserId }
        ]
      }
    });

    if (!friendship) {
      return res.status(404).json({
        status: false,
        message: "Friendship not found",
      });
    }

    await friendship.destroy();

    return res.status(200).json({
      status: true,
      message: "Friendship deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting friendship:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Block user
export const blockUser = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const { friendshipId } = req.params;
    const currentUserId = req.user.id;

    const friendship = await Friend.findOne({
      where: {
        id: friendshipId,
        [Op.or]: [
          { userId: currentUserId },
          { friendId: currentUserId }
        ]
      }
    });

    if (!friendship) {
      return res.status(404).json({
        status: false,
        message: "Friendship not found",
      });
    }

    await friendship.update({ status: 'blocked' });

    return res.status(200).json({
      status: true,
      message: "User blocked successfully",
    });
  } catch (error) {
    console.error("Error blocking user:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};
