import { Request, Response } from 'express';
import Favorite from '../models/favorite_model';
import { SubscriptionService } from '../services/subscription.service';
import Marketplace from '../models/marketplace_model';
import User from '../models/user_model';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

export const addToFavorites = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { marketplaceId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
    }

    if (!marketplaceId) {
      return res.status(400).json({
        status: false,
        message: 'Marketplace ID is required',
      });
    }

    // Check if user can use favorites feature
    const favoritesAccess = await SubscriptionService.canClientUseFavorites(userId);
    if (!favoritesAccess.canUseFavorites) {
      return res.status(403).json({
        status: false,
        message: favoritesAccess.reason || 'Favorites feature not available',
        requiresSubscription: true,
      });
    }

    // Check if already favorited
    const existingFavorite = await Favorite.findOne({
      where: {
        userId,
        marketplaceId,
      },
    });

    if (existingFavorite) {
      return res.status(400).json({
        status: false,
        message: 'Marketplace already in favorites',
      });
    }

    // Create favorite
    const favorite = await Favorite.create({
      userId,
      marketplaceId,
    });

    res.status(201).json({
      status: true,
      message: 'Added to favorites successfully',
      data: {
        id: favorite.id,
        marketplaceId: favorite.marketplaceId,
        createdAt: favorite.createdAt,
      },
    });
  } catch (error) {
    console.error('Add to favorites error:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to add to favorites',
    });
  }
};

export const removeFromFavorites = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { marketplaceId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
    }

    if (!marketplaceId) {
      return res.status(400).json({
        status: false,
        message: 'Marketplace ID is required',
      });
    }

    // Find and delete favorite
    const favorite = await Favorite.findOne({
      where: {
        userId,
        marketplaceId,
      },
    });

    if (!favorite) {
      return res.status(404).json({
        status: false,
        message: 'Favorite not found',
      });
    }

    await favorite.destroy();

    res.status(200).json({
      status: true,
      message: 'Removed from favorites successfully',
    });
  } catch (error) {
    console.error('Remove from favorites error:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to remove from favorites',
    });
  }
};

export const getUserFavorites = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { page = 1, limit = 20 } = req.query;

    if (!userId) {
      return res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
    }

    // Check if user can use favorites feature
    const favoritesAccess = await SubscriptionService.canClientUseFavorites(userId);
    if (!favoritesAccess.canUseFavorites) {
      return res.status(403).json({
        status: false,
        message: favoritesAccess.reason || 'Favorites feature not available',
        requiresSubscription: true,
      });
    }

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    // Get favorites with basic info
    const { count, rows: favorites } = await Favorite.findAndCountAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset,
    });

    const totalPages = Math.ceil(count / limitNum);

    res.status(200).json({
      status: true,
      message: 'Favorites retrieved successfully',
      data: {
        favorites: favorites.map(fav => ({
          id: fav.id,
          marketplaceId: fav.marketplaceId,
          createdAt: fav.createdAt,
        })),
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: count,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
        },
      },
    });
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to get favorites',
    });
  }
};

export const checkFavoriteStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { marketplaceId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
    }

    if (!marketplaceId) {
      return res.status(400).json({
        status: false,
        message: 'Marketplace ID is required',
      });
    }

    const favorite = await Favorite.findOne({
      where: {
        userId,
        marketplaceId,
      },
    });

    res.status(200).json({
      status: true,
      data: {
        isFavorite: !!favorite,
        favoriteId: favorite?.id || null,
      },
    });
  } catch (error) {
    console.error('Check favorite status error:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to check favorite status',
    });
  }
};
