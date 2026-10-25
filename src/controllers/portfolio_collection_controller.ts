import { Response } from "express";
import { Op, Transaction } from "sequelize";
import { AuthRequest } from "../middlewares/auth.middleware";
import sequelize from "../config/database";
import { PortfolioCollection } from "../models/portfolio_collection_model";
import { PortfolioCollectionItem } from "../models/portfolio_collection_item_model";
import { PortfolioCollectionMember } from "../models/portfolio_collection_member_model";
import { Friend } from "../models/friend_model";
import { User } from "../models/user_model";
import { Marketplace } from "../models/marketplace_model";
import { Video } from "../models/video_model";

function requireUser(req: AuthRequest, res: Response): string | null {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ status: false, message: "Authentication required" });
    return null;
  }
  return userId;
}

async function canAccessCollection(
  collectionId: string,
  userId: string
): Promise<{ collection: PortfolioCollection | null; isOwner: boolean }> {
  const collection = await PortfolioCollection.findByPk(collectionId);
  if (!collection) return { collection: null, isOwner: false };
  if (collection.ownerUserId === userId) {
    return { collection, isOwner: true };
  }
  const member = await PortfolioCollectionMember.findOne({
    where: { collectionId, userId },
  });
  if (member) return { collection, isOwner: false };
  return { collection: null, isOwner: false };
}

async function serializeCollection(
  collection: PortfolioCollection,
  userId: string
) {
  const itemCount = await PortfolioCollectionItem.count({
    where: { collectionId: collection.id },
  });
  const members = await PortfolioCollectionMember.findAll({
    where: { collectionId: collection.id },
    include: [
      {
        model: User,
        as: "memberUser",
        attributes: ["id", "name", "profilePic", "email"],
      },
    ],
  });
  const cover =
    collection.coverImageUrl ||
    (
      await PortfolioCollectionItem.findOne({
        where: {
          collectionId: collection.id,
          itemType: "portfolio_image",
          imageUrl: { [Op.not]: null },
        },
        order: [["createdAt", "DESC"]],
      })
    )?.imageUrl ||
    null;

  return {
    id: collection.id,
    ownerUserId: collection.ownerUserId,
    name: collection.name,
    coverImageUrl: cover,
    isPrivate: collection.isPrivate,
    itemCount,
    isOwner: collection.ownerUserId === userId,
    members: members.map((m: any) => ({
      id: m.userId,
      name: m.memberUser?.name ?? "",
      profilePic: m.memberUser?.profilePic ?? null,
    })),
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  };
}

export const listCollections = async (req: AuthRequest, res: Response) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;

    const owned = await PortfolioCollection.findAll({
      where: { ownerUserId: userId },
      order: [["updatedAt", "DESC"]],
    });

    const memberships = await PortfolioCollectionMember.findAll({
      where: { userId },
      attributes: ["collectionId"],
    });
    const sharedIds = memberships.map((m) => m.collectionId);
    const shared =
      sharedIds.length === 0
        ? []
        : await PortfolioCollection.findAll({
            where: { id: { [Op.in]: sharedIds } },
            order: [["updatedAt", "DESC"]],
          });

    const allSavedCount = await PortfolioCollectionItem.count({
      where: { ownerUserId: userId },
      distinct: true,
      col: "id",
    });

    const ownedSerialized = await Promise.all(
      owned.map((c) => serializeCollection(c, userId))
    );
    const sharedSerialized = await Promise.all(
      shared.map((c) => serializeCollection(c, userId))
    );

    return res.status(200).json({
      status: true,
      message: "Collections fetched",
      data: {
        allSavedCount,
        owned: ownedSerialized,
        shared: sharedSerialized,
      },
    });
  } catch (error: any) {
    console.error("listCollections error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Failed to list collections",
    });
  }
};

export const createCollection = async (req: AuthRequest, res: Response) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;

    const name = String(req.body.name || "").trim();
    if (!name || name.length > 40) {
      return res.status(400).json({
        status: false,
        message: "Collection name is required (max 40 characters).",
      });
    }

    const memberIds: string[] = Array.isArray(req.body.memberIds)
      ? req.body.memberIds.map((id: unknown) => String(id))
      : [];

    const collection = await sequelize.transaction(async (transaction) => {
      const created = await PortfolioCollection.create(
        {
          ownerUserId: userId,
          name,
          coverImageUrl: req.body.coverImageUrl
            ? String(req.body.coverImageUrl)
            : null,
          isPrivate: req.body.isPrivate !== false,
        },
        { transaction }
      );

      for (const friendId of memberIds) {
        if (friendId === userId) continue;
        const friendship = await Friend.findOne({
          where: {
            status: "accepted",
            [Op.or]: [
              { userId, friendId },
              { userId: friendId, friendId: userId },
            ],
          },
          transaction,
        });
        if (!friendship) continue;
        await PortfolioCollectionMember.findOrCreate({
          where: { collectionId: created.id, userId: friendId },
          defaults: { collectionId: created.id, userId: friendId },
          transaction,
        });
      }

      const itemType = req.body.itemType as string | undefined;
      if (itemType === "portfolio_image" || itemType === "reel") {
        await saveItemInternal(userId, created.id, req.body, transaction);
      }

      return created;
    });

    const data = await serializeCollection(collection, userId);
    return res.status(201).json({
      status: true,
      message: "Collection created",
      data,
    });
  } catch (error: any) {
    console.error("createCollection error:", error);
    if (
      error?.name === "SequelizeUniqueConstraintError" ||
      String(error?.message || "").includes("pc_owner_name_unique")
    ) {
      return res.status(400).json({
        status: false,
        message: "You already have a collection with that name.",
      });
    }
    return res.status(500).json({
      status: false,
      message: error.message || "Failed to create collection",
    });
  }
};

async function saveItemInternal(
  userId: string,
  collectionId: string,
  body: any,
  transaction?: Transaction
) {
  const itemType = body.itemType as "portfolio_image" | "reel";
  if (itemType === "portfolio_image") {
    const imageUrl = String(body.imageUrl || "").trim();
    if (!imageUrl) throw new Error("imageUrl is required");
    const marketplaceId = body.marketplaceId
      ? String(body.marketplaceId)
      : null;
    const [item] = await PortfolioCollectionItem.findOrCreate({
      where: {
        collectionId,
        ownerUserId: userId,
        itemType: "portfolio_image",
        imageUrl,
      },
      defaults: {
        collectionId,
        ownerUserId: userId,
        itemType: "portfolio_image",
        imageUrl,
        marketplaceId,
        videoId: null,
      },
      transaction,
    });
    if (marketplaceId && !item.marketplaceId) {
      await item.update({ marketplaceId }, { transaction });
    }
    const collection = await PortfolioCollection.findByPk(collectionId, {
      transaction,
    });
    if (collection && !collection.coverImageUrl) {
      await collection.update({ coverImageUrl: imageUrl }, { transaction });
    }
    return item;
  }

  const videoId = String(body.videoId || "").trim();
  if (!videoId) throw new Error("videoId is required");
  const video = await Video.findByPk(videoId, { transaction });
  if (!video) throw new Error("Reel not found");

  let marketplaceId = body.marketplaceId ? String(body.marketplaceId) : null;
  if (!marketplaceId && video.userId) {
    const owner = await User.findByPk(video.userId, {
      attributes: ["marketplaceId"],
      transaction,
    });
    marketplaceId = owner?.marketplaceId ?? null;
  }

  const [item] = await PortfolioCollectionItem.findOrCreate({
    where: {
      collectionId,
      ownerUserId: userId,
      itemType: "reel",
      videoId,
    },
    defaults: {
      collectionId,
      ownerUserId: userId,
      itemType: "reel",
      videoId,
      imageUrl: video.thumbnailUrl || null,
      marketplaceId,
    },
    transaction,
  });
  if (marketplaceId && !item.marketplaceId) {
    await item.update({ marketplaceId }, { transaction });
  }
  return item;
}

async function findOrCreateAllSaved(userId: string) {
  const [collection] = await PortfolioCollection.findOrCreate({
    where: { ownerUserId: userId, name: "All Saved" },
    defaults: {
      ownerUserId: userId,
      name: "All Saved",
      coverImageUrl: null,
      isPrivate: true,
    },
  });
  return collection;
}

function itemMatchWhere(
  userId: string,
  collectionId: string,
  body: any
): Record<string, unknown> | null {
  const itemType = body.itemType as string;
  if (itemType === "portfolio_image") {
    const imageUrl = String(body.imageUrl || "").trim();
    if (!imageUrl) return null;
    return {
      collectionId,
      ownerUserId: userId,
      itemType: "portfolio_image",
      imageUrl,
    };
  }
  if (itemType === "reel") {
    const videoId = String(body.videoId || "").trim();
    if (!videoId) return null;
    return {
      collectionId,
      ownerUserId: userId,
      itemType: "reel",
      videoId,
    };
  }
  return null;
}

export const saveItem = async (req: AuthRequest, res: Response) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;

    const rawCollectionId = req.body.collectionId;
    if (!rawCollectionId) {
      return res.status(400).json({
        status: false,
        message: "collectionId is required",
      });
    }

    let collection: PortfolioCollection | null = null;
    if (String(rawCollectionId) === "all") {
      collection = await findOrCreateAllSaved(userId);
    } else {
      const access = await canAccessCollection(String(rawCollectionId), userId);
      if (!access.collection || !access.isOwner) {
        return res.status(403).json({
          status: false,
          message: "Only the collection owner can save items here.",
        });
      }
      collection = access.collection;
    }

    // Instagram-style toggle: already in this collection → remove (all dupes), else save
    const matchWhere = itemMatchWhere(userId, collection.id, req.body);
    if (!matchWhere) {
      return res.status(400).json({
        status: false,
        message: "itemType and imageUrl or videoId required",
      });
    }

    const existingCount = await PortfolioCollectionItem.count({
      where: matchWhere,
    });
    if (existingCount > 0) {
      await PortfolioCollectionItem.destroy({ where: matchWhere });
      return res.status(200).json({
        status: true,
        message: "Removed from collection",
        removed: true,
        data: null,
      });
    }

    const item = await saveItemInternal(userId, collection.id, req.body);
    return res.status(200).json({
      status: true,
      message: "Saved to collection",
      removed: false,
      data: item,
    });
  } catch (error: any) {
    console.error("saveItem error:", error);
    return res.status(400).json({
      status: false,
      message: error.message || "Failed to save item",
    });
  }
};

export const updateCollection = async (req: AuthRequest, res: Response) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const collectionId = String(req.params.collectionId || "");
    const access = await canAccessCollection(collectionId, userId);
    if (!access.collection || !access.isOwner) {
      return res.status(403).json({
        status: false,
        message: "Only the owner can update this collection",
      });
    }

    const updates: Partial<{ name: string; isPrivate: boolean; coverImageUrl: string | null }> =
      {};
    if (typeof req.body.name === "string") {
      const name = req.body.name.trim();
      if (!name || name.length > 40) {
        return res.status(400).json({
          status: false,
          message: "Collection name is required (max 40 characters).",
        });
      }
      updates.name = name;
    }
    if (typeof req.body.isPrivate === "boolean") {
      updates.isPrivate = req.body.isPrivate;
    }
    if (req.body.coverImageUrl !== undefined) {
      updates.coverImageUrl = req.body.coverImageUrl
        ? String(req.body.coverImageUrl)
        : null;
    }

    await access.collection.update(updates);
    const data = await serializeCollection(access.collection, userId);
    return res.status(200).json({
      status: true,
      message: "Collection updated",
      data,
    });
  } catch (error: any) {
    return res.status(500).json({
      status: false,
      message: error.message || "Failed to update collection",
    });
  }
};

export const deleteCollection = async (req: AuthRequest, res: Response) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const collectionId = String(req.params.collectionId || "");
    const access = await canAccessCollection(collectionId, userId);
    if (!access.collection || !access.isOwner) {
      return res.status(403).json({
        status: false,
        message: "Only the owner can delete this collection",
      });
    }
    await PortfolioCollectionItem.destroy({ where: { collectionId } });
    await PortfolioCollectionMember.destroy({ where: { collectionId } });
    await access.collection.destroy();
    return res.status(200).json({
      status: true,
      message: "Collection deleted",
    });
  } catch (error: any) {
    return res.status(500).json({
      status: false,
      message: error.message || "Failed to delete collection",
    });
  }
};

export const removeItem = async (req: AuthRequest, res: Response) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;

    const itemId = String(req.params.itemId || "");
    const item = await PortfolioCollectionItem.findByPk(itemId);
    if (!item || item.ownerUserId !== userId) {
      return res.status(404).json({
        status: false,
        message: "Saved item not found",
      });
    }
    await item.destroy();
    return res.status(200).json({
      status: true,
      message: "Removed from collection",
    });
  } catch (error: any) {
    console.error("removeItem error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Failed to remove item",
    });
  }
};

export const listItems = async (req: AuthRequest, res: Response) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;

    const collectionId = req.query.collectionId
      ? String(req.query.collectionId)
      : null;
    const itemType = req.query.itemType
      ? String(req.query.itemType)
      : null;

    let where: any = {};

    if (collectionId === "all" || !collectionId) {
      where.ownerUserId = userId;
    } else {
      const access = await canAccessCollection(collectionId, userId);
      if (!access.collection) {
        return res.status(403).json({
          status: false,
          message: "You do not have access to this collection",
        });
      }
      where.collectionId = collectionId;
    }

    if (itemType === "portfolio_image" || itemType === "reel") {
      where.itemType = itemType;
    }

    const items = await PortfolioCollectionItem.findAll({
      where,
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: Marketplace,
          as: "marketplace",
          attributes: ["id", "businessName", "userId"],
          required: false,
        },
        {
          model: Video,
          as: "video",
          required: false,
          include: [
            {
              model: User,
              as: "owner",
              attributes: ["id", "name", "profilePic", "role", "marketplaceId"],
              required: false,
            },
          ],
        },
      ],
    });

    return res.status(200).json({
      status: true,
      message: "Items fetched",
      data: items,
    });
  } catch (error: any) {
    console.error("listItems error:", error);
    return res.status(500).json({
      status: false,
      message: error.message || "Failed to list items",
    });
  }
};

export const getCollection = async (req: AuthRequest, res: Response) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const collectionId = String(req.params.collectionId || "");
    const access = await canAccessCollection(collectionId, userId);
    if (!access.collection) {
      return res.status(404).json({
        status: false,
        message: "Collection not found",
      });
    }
    const data = await serializeCollection(access.collection, userId);
    return res.status(200).json({ status: true, data });
  } catch (error: any) {
    return res.status(500).json({
      status: false,
      message: error.message || "Failed to get collection",
    });
  }
};

export const updateMembers = async (req: AuthRequest, res: Response) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const collectionId = String(req.params.collectionId || "");
    const access = await canAccessCollection(collectionId, userId);
    if (!access.collection || !access.isOwner) {
      return res.status(403).json({
        status: false,
        message: "Only the owner can manage members",
      });
    }

    const memberIds: string[] = Array.isArray(req.body.memberIds)
      ? req.body.memberIds.map((id: unknown) => String(id))
      : [];

    await PortfolioCollectionMember.destroy({ where: { collectionId } });

    for (const friendId of memberIds) {
      if (friendId === userId) continue;
      const friendship = await Friend.findOne({
        where: {
          status: "accepted",
          [Op.or]: [
            { userId, friendId },
            { userId: friendId, friendId: userId },
          ],
        },
      });
      if (!friendship) continue;
      await PortfolioCollectionMember.create({
        collectionId,
        userId: friendId,
      });
    }

    const data = await serializeCollection(access.collection, userId);
    return res.status(200).json({
      status: true,
      message: "Members updated",
      data,
    });
  } catch (error: any) {
    return res.status(500).json({
      status: false,
      message: error.message || "Failed to update members",
    });
  }
};

export const checkSaved = async (req: AuthRequest, res: Response) => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;

    const itemType = String(req.query.itemType || "");
    const imageUrl = req.query.imageUrl
      ? String(req.query.imageUrl)
      : null;
    const videoId = req.query.videoId ? String(req.query.videoId) : null;

    const where: any = { ownerUserId: userId, itemType };
    if (itemType === "portfolio_image" && imageUrl) {
      where.imageUrl = imageUrl;
    } else if (itemType === "reel" && videoId) {
      where.videoId = videoId;
    } else {
      return res.status(400).json({
        status: false,
        message: "itemType and imageUrl or videoId required",
      });
    }

    const count = await PortfolioCollectionItem.count({ where });
    return res.status(200).json({
      status: true,
      data: { saved: count > 0 },
    });
  } catch (error: any) {
    return res.status(500).json({
      status: false,
      message: error.message || "Failed to check saved status",
    });
  }
};
