import { Request, Response, Express } from "express";
import path from "path";
import sequelize from "../config/database";
import { User } from "../models/user_model";
import { Video } from "../models/video_model";
import { VideoLike } from "../models/video_like_model";
import { VideoComment } from "../models/video_comment_model";
import { VideoCommentReaction, VideoCommentReactionType } from "../models/video_comment_reaction_model";
import { VideoFollow } from "../models/video_follow_model";
import { Social } from "../models/social_model";
import { Marketplace } from "../models/marketplace_model";
import { localFileStorage } from "../utils/local-storage";



type UploadedFile = Express.Multer.File;
interface AuthenticatedRequest extends Request {
  user?: User;
  userId?: string;
}

const PUBLIC_USER_ATTRIBUTES = ["id", "name", "profilePic", "businessName", "role", "marketplaceId"] as const;

const PROVIDER_ROLES = new Set(["solo", "suite"]);

const resolveOwnerDisplayName = (owner: Record<string, unknown>): string => {
  const role = String(owner.role ?? "").toLowerCase();
  const marketplace = owner.marketplace as Record<string, unknown> | undefined;
  const marketplaceName = String(marketplace?.businessName ?? "").trim();
  if (PROVIDER_ROLES.has(role) && marketplaceName.length > 0) {
    return marketplaceName;
  }
  const businessName = String(owner.businessName ?? "").trim();
  if (PROVIDER_ROLES.has(role) && businessName.length > 0) {
    return businessName;
  }
  const personalName = String(owner.name ?? "").trim();
  return personalName.length > 0 ? personalName : "Creator";
};

const toPublicFileUrl = (folder: string, filename: string): string => {
  const relativePath = path.join(folder, filename).replace(/\\/g, "/");
  return localFileStorage.getPublicUrl(relativePath);
};

const parsePositiveInteger = (value: unknown, fallback: number, max: number): number => {
  const parsedValue = typeof value === "string" ? parseInt(value, 10) : Number(value);
  if (Number.isNaN(parsedValue) || parsedValue <= 0) {
    return fallback;
  }
  return Math.min(parsedValue, max);
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value: string): boolean => UUID_REGEX.test(value);

/** Ambiguity-free alphabet (no 0/O/1/l/I) for TikTok-style reel share codes. */
const SHORT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const SHORT_CODE_LENGTH = 8;

const generateShortCode = (): string => {
  let code = "";
  for (let i = 0; i < SHORT_CODE_LENGTH; i += 1) {
    code += SHORT_CODE_ALPHABET[Math.floor(Math.random() * SHORT_CODE_ALPHABET.length)];
  }
  return code;
};

const findUniqueShortCode = async (): Promise<string> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateShortCode();
    const existing = await Video.findOne({
      where: { shortCode: code },
      attributes: ["id"],
    });
    if (!existing) {
      return code;
    }
  }
  throw new Error("Could not allocate a unique video short code");
};

/** Accepts a string (comma- and/or space-separated, TikTok-style - e.g.
 * "#barber #haircut, salon") or an array of strings, and returns a
 * cleaned, deduplicated array (trimmed, no empties, no leading '#'). */
const parseTags = (value: unknown): string[] | null => {
  let rawTags: unknown[];

  if (typeof value === "string") {
    rawTags = value.split(/[,\s]+/);
  } else if (Array.isArray(value)) {
    rawTags = value;
  } else {
    return null;
  }

  const cleaned = rawTags
    .map((tag) => (typeof tag === "string" ? tag.trim().replace(/^#+/, "") : ""))
    .filter((tag) => tag.length > 0);

  return Array.from(new Set(cleaned));
};

const getVideoOwnerInclude = () => ({
  model: User,
  as: "owner",
  attributes: [...PUBLIC_USER_ATTRIBUTES],
  include: [
    {
      model: Marketplace,
      as: "marketplace",
      attributes: ["id", "businessName"],
    },
  ],
});

const getVideoCommentInclude = () => ({
  model: User,
  as: "user",
  attributes: [...PUBLIC_USER_ATTRIBUTES],
});

const resolveUserSocials = async (user: User) => {
  let marketplaceInsta: string | null = null;
  let marketplaceTiktok: string | null = null;

  if (user.marketplaceId) {
    const marketplaceSocial = await Social.findOne({
      where: { marketplaceId: user.marketplaceId },
      attributes: ["insta", "tiktok"],
    });

    marketplaceInsta = marketplaceSocial?.insta ?? null;
    marketplaceTiktok = marketplaceSocial?.tiktok ?? null;
  }

  return {
    insta: user.insta || marketplaceInsta || null,
    tiktok: user.tiktok || marketplaceTiktok || null,
  };
};

const extractUploadedFiles = (req: Request) => {
  const files = req.files as { [field: string]: UploadedFile[] } | undefined;
  const videoFile = files?.video?.[0];
  const thumbnailFile = files?.thumbnail?.[0];
  return { videoFile, thumbnailFile };
};

const cleanupVideoUpload = async (videoFile?: UploadedFile, thumbnailFile?: UploadedFile) => {
  await Promise.all([
    videoFile ? localFileStorage.deleteFile(path.join("videos", videoFile.filename).replace(/\\/g, "/")) : Promise.resolve(),
    thumbnailFile ? localFileStorage.deleteFile(path.join("video-thumbnails", thumbnailFile.filename).replace(/\\/g, "/")) : Promise.resolve(),
  ]);
};

const serializeVideoRow = (
  video: Video,
  isLikedByCurrentUser = false
): Record<string, unknown> => {
  const rawVideo = video.toJSON() as Record<string, unknown>;
  const owner = rawVideo.owner as Record<string, unknown> | undefined;
  if (owner) {
    owner.displayName = resolveOwnerDisplayName(owner);
  }
  return {
    ...rawVideo,
    isLikedByCurrentUser,
  };
};

export const uploadVideo = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  const transaction = await sequelize.transaction();
  let videoFile: UploadedFile | undefined;
  let thumbnailFile: UploadedFile | undefined;

  try {
    if (!req.userId) {
      await transaction.rollback();
      return res.status(401).json({ status: false, message: "Authentication required" });
    }

    const uploadedFiles = extractUploadedFiles(req);
    videoFile = uploadedFiles.videoFile;
    thumbnailFile = uploadedFiles.thumbnailFile;

    const caption = typeof req.body.caption === "string" && req.body.caption.trim().length > 0 ? req.body.caption.trim() : null;
    const location = typeof req.body.location === "string" && req.body.location.trim().length > 0 ? req.body.location.trim() : null;
    const tags = parseTags(req.body.tags) ?? [];
    const thumbnailUrl = typeof req.body.thumbnailUrl === "string" && req.body.thumbnailUrl.trim().length > 0
      ? req.body.thumbnailUrl.trim()
      : null;

    if (!videoFile) {
      await transaction.rollback();
      return res.status(400).json({ status: false, message: "Video file is required" });
    }

    const video = await Video.create(
      {
        userId: req.userId,
        videoUrl: toPublicFileUrl("videos", videoFile.filename),
        caption,
        location,
        tags,
        thumbnailUrl: thumbnailFile
          ? toPublicFileUrl("video-thumbnails", thumbnailFile.filename)
          : thumbnailUrl,
        shortCode: await findUniqueShortCode(),
        likeCount: 0,
        commentCount: 0,
      },
      { transaction }
    );

    await transaction.commit();

    return res.status(201).json({
      status: true,
      message: "Video uploaded successfully",
      data: video,
    });
  } catch (error) {
    await transaction.rollback();
    await cleanupVideoUpload(videoFile, thumbnailFile);
    console.error("Error uploading video:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to upload video",
      ...(process.env.SEND_ERRORS === "true" && {
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    });
  }
};

export const getVideosByUser = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const { userId } = req.params;
    const page = parsePositiveInteger(req.query.page, 1, 1000);
    const limit = parsePositiveInteger(req.query.limit, 20, 100);
    const offset = (page - 1) * limit;

    const { count, rows } = await Video.findAndCountAll({
      where: { userId },
      include: [getVideoOwnerInclude()],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    const videoIds = rows.map((video) => video.id);
    const likedVideoIds = new Set<string>();

    if (req.userId && videoIds.length > 0) {
      const likes = await VideoLike.findAll({
        where: {
          userId: req.userId,
          videoId: videoIds,
        },
        attributes: ["videoId"],
      });

      for (const like of likes) {
        likedVideoIds.add(like.videoId);
      }
    }

    const videos = rows.map((video) =>
      serializeVideoRow(video, likedVideoIds.has(video.id))
    );

    return res.status(200).json({
      status: true,
      message: "Videos retrieved successfully",
      data: {
        videos,
        pagination: {
          currentPage: page,
          totalPages: Math.max(1, Math.ceil(count / limit)),
          totalItems: count,
          hasNextPage: offset + rows.length < count,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Error retrieving user videos:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to retrieve videos",
    });
  }
};

const EDIT_WINDOW_MS = 30 * 60 * 1000;

export const updateVideo = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    if (!req.userId) {
      return res.status(401).json({ status: false, message: "Authentication required" });
    }

    const { videoId } = req.params;
    const video = await Video.findByPk(videoId);

    if (!video) {
      return res.status(404).json({ status: false, message: "Video not found" });
    }

    if (video.userId !== req.userId) {
      return res.status(403).json({ status: false, message: "You can only edit your own videos" });
    }

    const ageMs = Date.now() - video.createdAt.getTime();
    if (ageMs > EDIT_WINDOW_MS) {
      return res.status(403).json({
        status: false,
        message: "This video can no longer be edited - the 30-minute editing window has passed",
      });
    }

    if (typeof req.body.caption !== "string") {
      return res.status(400).json({ status: false, message: "Caption is required" });
    }

    video.caption = req.body.caption.trim();

    if (typeof req.body.location === "string") {
      const trimmedLocation = req.body.location.trim();
      video.location = trimmedLocation.length > 0 ? trimmedLocation : null;
    }

    const tags = parseTags(req.body.tags);
    if (tags !== null) {
      video.tags = tags;
    }

    await video.save();

    const updatedVideo = await Video.findByPk(videoId, {
      include: [getVideoOwnerInclude()],
    });

    return res.status(200).json({
      status: true,
      message: "Video updated successfully",
      data: updatedVideo,
    });
  } catch (error) {
    console.error("Error updating video:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to update video",
    });
  }
};

export const deleteVideo = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    if (!req.userId) {
      return res.status(401).json({ status: false, message: "Authentication required" });
    }

    const { videoId } = req.params;
    const video = await Video.findByPk(videoId);

    if (!video) {
      return res.status(404).json({ status: false, message: "Video not found" });
    }

    if (video.userId !== req.userId) {
      return res.status(403).json({ status: false, message: "You can only delete your own videos" });
    }

    const { videoUrl, thumbnailUrl } = video;

    await video.destroy();

    // Best-effort cleanup of the underlying media files - the DB row (and
    // its likes/comments, via ON DELETE CASCADE) is already gone regardless.
    await Promise.all([
      localFileStorage.deleteFile(localFileStorage.extractRelativePath(videoUrl)),
      thumbnailUrl
        ? localFileStorage.deleteFile(localFileStorage.extractRelativePath(thumbnailUrl))
        : Promise.resolve(),
    ]);

    return res.status(200).json({
      status: true,
      message: "Video deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting video:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to delete video",
    });
  }
};

export const getFeedVideos = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const page = parsePositiveInteger(req.query.page, 1, 1000);
    const limit = parsePositiveInteger(req.query.limit, 20, 100);
    const offset = (page - 1) * limit;

    const { count, rows } = await Video.findAndCountAll({
      include: [getVideoOwnerInclude()],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    const videoIds = rows.map((video) => video.id);
    const likedVideoIds = new Set<string>();

    if (req.userId && videoIds.length > 0) {
      const likes = await VideoLike.findAll({
        where: {
          userId: req.userId,
          videoId: videoIds,
        },
        attributes: ["videoId"],
      });

      for (const like of likes) {
        likedVideoIds.add(like.videoId);
      }
    }

    const videos = rows.map((video) =>
      serializeVideoRow(video, likedVideoIds.has(video.id))
    );

    return res.status(200).json({
      status: true,
      message: "Feed videos retrieved successfully",
      data: {
        videos,
        pagination: {
          currentPage: page,
          totalPages: Math.max(1, Math.ceil(count / limit)),
          totalItems: count,
          hasNextPage: offset + rows.length < count,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Error retrieving feed videos:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to retrieve feed videos",
    });
  }
};

export const getVideoById = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const { videoId } = req.params;

    const video = await Video.findByPk(videoId, {
      include: [getVideoOwnerInclude()],
    });

    if (!video) {
      return res.status(404).json({
        status: false,
        message: "Video not found",
      });
    }

    let isLikedByCurrentUser = false;
    if (req.userId) {
      const like = await VideoLike.findOne({
        where: {
          videoId,
          userId: req.userId,
        },
      });
      isLikedByCurrentUser = !!like;
    }

    return res.status(200).json({
      status: true,
      message: "Video retrieved successfully",
      data: {
        ...video.toJSON(),
        isLikedByCurrentUser,
      },
    });
  } catch (error) {
    console.error("Error retrieving video:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to retrieve video",
    });
  }
};

/** Public TikTok-style short link resolver: /r/:code → redirects to the video file. */
export const redirectToReelShortLink = async (req: Request, res: Response): Promise<Response> => {
  try {
    const rawCode = String(req.params.code ?? "").trim();
    if (!rawCode) {
      return res.status(404).send("Reel not found");
    }

    const shortCodeMatch = await Video.findOne({
      where: { shortCode: rawCode },
      attributes: ["id", "videoUrl"],
    });

    const video = shortCodeMatch ?? (isUuid(rawCode) ? await Video.findByPk(rawCode, { attributes: ["id", "videoUrl"] }) : null);

    if (!video || !video.videoUrl) {
      return res.status(404).send("Reel not found");
    }

    res.redirect(302, video.videoUrl);
    return res;
  } catch (error) {
    console.error("Error resolving reel short link:", error);
    return res.status(500).send("Could not resolve reel link");
  }
};

/** Resolves a short code to the full video, for opening reels from in-app deep links. */
export const getVideoByShortCode = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<Response> => {
  try {
    const rawCode = String(req.params.code ?? "").trim();
    const video = await Video.findOne({
      where: { shortCode: rawCode },
      include: [getVideoOwnerInclude()],
    });

    if (!video) {
      return res.status(404).json({
        status: false,
        message: "Video not found",
      });
    }

    let isLikedByCurrentUser = false;
    if (req.userId) {
      const like = await VideoLike.findOne({
        where: {
          videoId: video.id,
          userId: req.userId,
        },
      });
      isLikedByCurrentUser = !!like;
    }

    return res.status(200).json({
      status: true,
      message: "Video retrieved successfully",
      data: {
        ...video.toJSON(),
        isLikedByCurrentUser,
      },
    });
  } catch (error) {
    console.error("Error retrieving video by short code:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to retrieve video",
    });
  }
};

export const likeVideo = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  const transaction = await sequelize.transaction();

  try {
    if (!req.userId) {
      await transaction.rollback();
      return res.status(401).json({ status: false, message: "Authentication required" });
    }

    const { videoId } = req.params;
    const video = await Video.findByPk(videoId, { transaction });

    if (!video) {
      await transaction.rollback();
      return res.status(404).json({ status: false, message: "Video not found" });
    }

    const existingLike = await VideoLike.findOne({
      where: { videoId, userId: req.userId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (existingLike) {
      await transaction.rollback();
      return res.status(400).json({ status: false, message: "You already liked this video" });
    }

    await VideoLike.create(
      {
        videoId,
        userId: req.userId,
      },
      { transaction }
    );

    await video.increment("likeCount", { by: 1, transaction });
    await transaction.commit();

    const updatedVideo = await Video.findByPk(videoId, {
      include: [getVideoOwnerInclude()],
    });

    return res.status(201).json({
      status: true,
      message: "Video liked successfully",
      data: updatedVideo,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error liking video:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to like video",
    });
  }
};

export const unlikeVideo = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  const transaction = await sequelize.transaction();

  try {
    if (!req.userId) {
      await transaction.rollback();
      return res.status(401).json({ status: false, message: "Authentication required" });
    }

    const { videoId } = req.params;
    const video = await Video.findByPk(videoId, { transaction });

    if (!video) {
      await transaction.rollback();
      return res.status(404).json({ status: false, message: "Video not found" });
    }

    const existingLike = await VideoLike.findOne({
      where: { videoId, userId: req.userId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!existingLike) {
      await transaction.rollback();
      return res.status(404).json({ status: false, message: "Like not found" });
    }

    await existingLike.destroy({ transaction });
    await video.decrement("likeCount", { by: 1, transaction });
    await transaction.commit();

    const updatedVideo = await Video.findByPk(videoId, {
      include: [getVideoOwnerInclude()],
    });

    return res.status(200).json({
      status: true,
      message: "Video unliked successfully",
      data: updatedVideo,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error unliking video:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to unlike video",
    });
  }
};

/** Batch-fetch the requesting user's reaction (like/dislike/none) for a set of comments. */
const getCurrentUserReactionMap = async (
  userId: string | undefined,
  commentIds: string[]
): Promise<Map<string, VideoCommentReactionType>> => {
  const reactionMap = new Map<string, VideoCommentReactionType>();

  if (!userId || commentIds.length === 0) {
    return reactionMap;
  }

  const reactions = await VideoCommentReaction.findAll({
    where: {
      userId,
      commentId: commentIds,
    },
    attributes: ["commentId", "type"],
  });

  for (const reaction of reactions) {
    reactionMap.set(reaction.commentId, reaction.type);
  }

  return reactionMap;
};

const serializeComments = (
  comments: VideoComment[],
  reactionMap: Map<string, VideoCommentReactionType>
) => {
  return comments.map((comment) => {
    const rawComment = comment.toJSON() as Record<string, unknown>;
    return {
      ...rawComment,
      currentUserReaction: reactionMap.get(comment.id) ?? null,
    };
  });
};

export const addVideoComment = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  const transaction = await sequelize.transaction();

  try {
    if (!req.userId) {
      await transaction.rollback();
      return res.status(401).json({ status: false, message: "Authentication required" });
    }

    const { videoId } = req.params;
    const commentText = typeof req.body.commentText === "string"
      ? req.body.commentText.trim()
      : typeof req.body.comment === "string"
        ? req.body.comment.trim()
        : "";
    const parentCommentId = typeof req.body.parentCommentId === "string" && req.body.parentCommentId.trim().length > 0
      ? req.body.parentCommentId.trim()
      : null;

    if (!commentText) {
      await transaction.rollback();
      return res.status(400).json({ status: false, message: "Comment text is required" });
    }

    const video = await Video.findByPk(videoId, { transaction });

    if (!video) {
      await transaction.rollback();
      return res.status(404).json({ status: false, message: "Video not found" });
    }

    let parentComment: VideoComment | null = null;
    if (parentCommentId) {
      parentComment = await VideoComment.findByPk(parentCommentId, { transaction });

      if (!parentComment || parentComment.videoId !== videoId) {
        await transaction.rollback();
        return res.status(404).json({ status: false, message: "Comment being replied to was not found" });
      }
    }

    const comment = await VideoComment.create(
      {
        videoId,
        userId: req.userId,
        parentCommentId,
        commentText,
      },
      { transaction }
    );

    if (parentComment) {
      await parentComment.increment("replyCount", { by: 1, transaction });
    }

    await video.increment("commentCount", { by: 1, transaction });
    await transaction.commit();

    const createdComment = await VideoComment.findByPk(comment.id, {
      include: [getVideoCommentInclude()],
    });

    return res.status(201).json({
      status: true,
      message: parentComment ? "Reply added successfully" : "Comment added successfully",
      data: createdComment
        ? { ...createdComment.toJSON(), currentUserReaction: null }
        : createdComment,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error adding video comment:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to add comment",
    });
  }
};

export const getVideoComments = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const { videoId } = req.params;
    const page = parsePositiveInteger(req.query.page, 1, 1000);
    const limit = parsePositiveInteger(req.query.limit, 20, 100);
    const offset = (page - 1) * limit;

    const video = await Video.findByPk(videoId);

    if (!video) {
      return res.status(404).json({
        status: false,
        message: "Video not found",
      });
    }

    // Only top-level comments here - replies are lazily loaded per-comment
    // via getCommentReplies, the same way at every depth of the thread.
    const { count, rows } = await VideoComment.findAndCountAll({
      where: { videoId, parentCommentId: null },
      include: [getVideoCommentInclude()],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    const reactionMap = await getCurrentUserReactionMap(
      req.userId,
      rows.map((comment) => comment.id)
    );

    return res.status(200).json({
      status: true,
      message: "Comments retrieved successfully",
      data: {
        comments: serializeComments(rows, reactionMap),
        totalComments: count,
        pagination: {
          currentPage: page,
          totalPages: Math.max(1, Math.ceil(count / limit)),
          totalItems: count,
          hasNextPage: offset + rows.length < count,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Error retrieving video comments:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to retrieve comments",
    });
  }
};

export const getCommentReplies = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const { commentId } = req.params;
    const page = parsePositiveInteger(req.query.page, 1, 1000);
    const limit = parsePositiveInteger(req.query.limit, 20, 100);
    const offset = (page - 1) * limit;

    const parentComment = await VideoComment.findByPk(commentId);

    if (!parentComment) {
      return res.status(404).json({
        status: false,
        message: "Comment not found",
      });
    }

    // Ordered oldest-first so a reply thread reads top-to-bottom like a
    // conversation, unlike top-level comments which show newest-first.
    const { count, rows } = await VideoComment.findAndCountAll({
      where: { parentCommentId: commentId },
      include: [getVideoCommentInclude()],
      order: [["createdAt", "ASC"]],
      limit,
      offset,
      distinct: true,
    });

    const reactionMap = await getCurrentUserReactionMap(
      req.userId,
      rows.map((comment) => comment.id)
    );

    return res.status(200).json({
      status: true,
      message: "Replies retrieved successfully",
      data: {
        comments: serializeComments(rows, reactionMap),
        totalComments: count,
        pagination: {
          currentPage: page,
          totalPages: Math.max(1, Math.ceil(count / limit)),
          totalItems: count,
          hasNextPage: offset + rows.length < count,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Error retrieving comment replies:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to retrieve replies",
    });
  }
};

/** Shared upsert-style logic for setting/toggling/switching a comment reaction. */
const setCommentReaction = async (
  commentId: string,
  userId: string,
  type: VideoCommentReactionType
): Promise<{ status: number; body: Record<string, unknown> }> => {
  const transaction = await sequelize.transaction();

  try {
    const comment = await VideoComment.findByPk(commentId, { transaction });

    if (!comment) {
      await transaction.rollback();
      return { status: 404, body: { status: false, message: "Comment not found" } };
    }

    const existingReaction = await VideoCommentReaction.findOne({
      where: { commentId, userId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    let currentUserReaction: VideoCommentReactionType | null = type;

    if (existingReaction && existingReaction.type === type) {
      // Tapping the same reaction again removes it.
      await existingReaction.destroy({ transaction });
      await comment.decrement(type === "like" ? "likeCount" : "dislikeCount", { by: 1, transaction });
      currentUserReaction = null;
    } else if (existingReaction) {
      // Switching from like -> dislike or vice versa.
      await existingReaction.update({ type }, { transaction });
      await comment.decrement(existingReaction.type === "like" ? "likeCount" : "dislikeCount", {
        by: 1,
        transaction,
      });
      await comment.increment(type === "like" ? "likeCount" : "dislikeCount", { by: 1, transaction });
    } else {
      await VideoCommentReaction.create({ commentId, userId, type }, { transaction });
      await comment.increment(type === "like" ? "likeCount" : "dislikeCount", { by: 1, transaction });
    }

    await transaction.commit();

    const updatedComment = await VideoComment.findByPk(commentId, {
      include: [getVideoCommentInclude()],
    });

    return {
      status: 200,
      body: {
        status: true,
        message: "Reaction updated successfully",
        data: updatedComment
          ? { ...updatedComment.toJSON(), currentUserReaction }
          : updatedComment,
      },
    };
  } catch (error) {
    await transaction.rollback();
    console.error("Error setting comment reaction:", error);
    return { status: 500, body: { status: false, message: "Failed to update reaction" } };
  }
};

export const likeComment = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  if (!req.userId) {
    return res.status(401).json({ status: false, message: "Authentication required" });
  }

  const { commentId } = req.params;
  const result = await setCommentReaction(commentId, req.userId, "like");
  return res.status(result.status).json(result.body);
};

export const dislikeComment = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  if (!req.userId) {
    return res.status(401).json({ status: false, message: "Authentication required" });
  }

  const { commentId } = req.params;
  const result = await setCommentReaction(commentId, req.userId, "dislike");
  return res.status(result.status).json(result.body);
};

export const removeCommentReaction = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  if (!req.userId) {
    return res.status(401).json({ status: false, message: "Authentication required" });
  }

  const transaction = await sequelize.transaction();

  try {
    const { commentId } = req.params;
    const comment = await VideoComment.findByPk(commentId, { transaction });

    if (!comment) {
      await transaction.rollback();
      return res.status(404).json({ status: false, message: "Comment not found" });
    }

    const existingReaction = await VideoCommentReaction.findOne({
      where: { commentId, userId: req.userId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!existingReaction) {
      await transaction.rollback();
      return res.status(404).json({ status: false, message: "No reaction to remove" });
    }

    await existingReaction.destroy({ transaction });
    await comment.decrement(existingReaction.type === "like" ? "likeCount" : "dislikeCount", {
      by: 1,
      transaction,
    });

    await transaction.commit();

    const updatedComment = await VideoComment.findByPk(commentId, {
      include: [getVideoCommentInclude()],
    });

    return res.status(200).json({
      status: true,
      message: "Reaction removed successfully",
      data: updatedComment
        ? { ...updatedComment.toJSON(), currentUserReaction: null }
        : updatedComment,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error removing comment reaction:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to remove reaction",
    });
  }
};

export const deleteComment = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  if (!req.userId) {
    return res.status(401).json({ status: false, message: "Authentication required" });
  }

  const transaction = await sequelize.transaction();

  try {
    const { commentId } = req.params;
    const comment = await VideoComment.findByPk(commentId, { transaction });

    if (!comment) {
      await transaction.rollback();
      return res.status(404).json({ status: false, message: "Comment not found" });
    }

    if (comment.userId !== req.userId) {
      await transaction.rollback();
      return res.status(403).json({ status: false, message: "You can only delete your own comments" });
    }

    const { videoId, parentCommentId } = comment;

    // Replies are removed transitively via ON DELETE CASCADE on
    // parentCommentId, so count the comment plus every descendant first
    // to keep the video's denormalized commentCount accurate.
    const [countRows] = await sequelize.query(
      `WITH RECURSIVE descendants AS (
         SELECT id FROM "VideoComments" WHERE id = :commentId
         UNION ALL
         SELECT vc.id FROM "VideoComments" vc
         INNER JOIN descendants d ON vc."parentCommentId" = d.id
       )
       SELECT count(*)::int AS total FROM descendants`,
      { replacements: { commentId }, transaction }
    );
    const totalDeleted = (countRows[0] as { total: number }).total;

    await comment.destroy({ transaction });

    const video = await Video.findByPk(videoId, { transaction });
    if (video) {
      await video.decrement("commentCount", { by: totalDeleted, transaction });
    }

    if (parentCommentId) {
      const parentComment = await VideoComment.findByPk(parentCommentId, { transaction });
      if (parentComment) {
        await parentComment.decrement("replyCount", { by: 1, transaction });
      }
    }

    await transaction.commit();

    return res.status(200).json({
      status: true,
      message: "Comment deleted successfully",
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error deleting comment:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to delete comment",
    });
  }
};

export const getReelUserProfile = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    const { userId } = req.params;

    const user = await User.findByPk(userId, {
      attributes: [...PUBLIC_USER_ATTRIBUTES, "insta", "tiktok", "marketplaceId"],
    });

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    const socials = await resolveUserSocials(user);

    const marketplace = user.marketplaceId
      ? await Marketplace.findByPk(user.marketplaceId, {
          attributes: [
            "id",
            "businessName",
            "address",
            "bio",
            "imagesList",
            "phoneNumber",
            "portfolioImages",
          ],
        })
      : null;

    const [followersCount, followingCount, postsCount, posts] = await Promise.all([
      VideoFollow.count({ where: { followingId: userId } }),
      VideoFollow.count({ where: { followerId: userId } }),
      Video.count({ where: { userId } }),
      Video.findAll({
        where: { userId },
        include: [getVideoOwnerInclude()],
        order: [["createdAt", "DESC"]],
        limit: 60,
      }),
    ]);

    let isFollowing = false;
    if (req.userId && req.userId !== userId) {
      const relation = await VideoFollow.findOne({
        where: {
          followerId: req.userId,
          followingId: userId,
        },
      });
      isFollowing = !!relation;
    }

    const postIds = posts.map((video) => video.id);
    const likedPostIds = new Set<string>();

    if (req.userId && postIds.length > 0) {
      const likes = await VideoLike.findAll({
        where: {
          userId: req.userId,
          videoId: postIds,
        },
        attributes: ["videoId"],
      });

      for (const like of likes) {
        likedPostIds.add(like.videoId);
      }
    }

    const serializedPosts = posts.map((video) =>
      serializeVideoRow(video, likedPostIds.has(video.id))
    );

    const userJson = user.toJSON() as Record<string, unknown>;
    if (marketplace) {
      userJson.marketplace = marketplace.toJSON();
    }
    userJson.displayName = resolveOwnerDisplayName(userJson);

    return res.status(200).json({
      status: true,
      message: "Reel profile retrieved successfully",
      data: {
        user: userJson,
        marketplace,
        socials,
        isFollowing,
        stats: {
          followersCount,
          followingCount,
          postsCount,
        },
        posts: serializedPosts,
      },
    });
  } catch (error) {
    console.error("Error retrieving reel profile:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to retrieve reel profile",
    });
  }
};

export const followReelUser = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const { userId } = req.params;

    if (req.userId === userId) {
      return res.status(400).json({
        status: false,
        message: "You cannot follow yourself",
      });
    }

    const user = await User.findByPk(userId, {
      attributes: ["id"],
    });

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    await VideoFollow.findOrCreate({
      where: {
        followerId: req.userId,
        followingId: userId,
      },
      defaults: {
        followerId: req.userId,
        followingId: userId,
      },
    });

    const followersCount = await VideoFollow.count({
      where: { followingId: userId },
    });

    return res.status(200).json({
      status: true,
      message: "User followed successfully",
      data: {
        isFollowing: true,
        followersCount,
      },
    });
  } catch (error) {
    console.error("Error following user:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to follow user",
    });
  }
};

export const unfollowReelUser = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }

    const { userId } = req.params;

    await VideoFollow.destroy({
      where: {
        followerId: req.userId,
        followingId: userId,
      },
    });

    const followersCount = await VideoFollow.count({
      where: { followingId: userId },
    });

    return res.status(200).json({
      status: true,
      message: "User unfollowed successfully",
      data: {
        isFollowing: false,
        followersCount,
      },
    });
  } catch (error) {
    console.error("Error unfollowing user:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to unfollow user",
    });
  }
};