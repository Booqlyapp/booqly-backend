import { Request, Response } from 'express';
import { PromotionService } from '../services/promotion.service';
import { SubscriptionError } from '../utils/errors';


interface AuthRequest extends Request {
  user?: any;
  userId?: string;
}

/**
 * Create a new promotion
 */
export const createPromotion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const {
      name,
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      categoryId,
      subcategoryId,
      serviceIds,
      usageLimit,
      startDate,
      endDate,
    } = req.body;

    if (!name || !discountType || !discountValue || !startDate || !endDate) {
      res.status(400).json({
        status: false,
        message: 'Name, discount type, discount value, start date, and end date are required',
      });
      return;
    }

    const promotion = await PromotionService.createPromotion(req.userId, {
      name,
      description,
      discountType,
      discountValue: parseFloat(discountValue),
      minOrderAmount: minOrderAmount ? parseFloat(minOrderAmount) : undefined,
      maxDiscountAmount: maxDiscountAmount ? parseFloat(maxDiscountAmount) : undefined,
      categoryId,
      subcategoryId,
      serviceIds,
      usageLimit: usageLimit ? parseInt(usageLimit) : undefined,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });

    res.status(201).json({
      status: true,
      message: 'Promotion created successfully',
      data: promotion,
    });
  } catch (error) {
    console.error('Error creating promotion:', error);
    
    if (error instanceof SubscriptionError) {
      res.status(error.statusCode).json({
        status: false,
        message: error.message,
        errorType: 'subscription_required',
      });
      return;
    }
    
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : 'Failed to create promotion',
    });
  }
};

/**
 * Get promotions for the authenticated provider
 */
export const getMyPromotions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { page = 1, limit = 20, isActive, categoryId, subcategoryId } = req.query;

    const filters: any = {};
    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }
    if (categoryId) {
      filters.categoryId = categoryId as string;
    }
    if (subcategoryId) {
      filters.subcategoryId = subcategoryId as string;
    }

    const result = await PromotionService.getProviderPromotions(
      req.userId,
      parseInt(page as string),
      parseInt(limit as string),
      filters
    );

    res.status(200).json({
      status: true,
      message: 'Promotions retrieved successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error fetching promotions:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch promotions',
    });
  }
};

/**
 * Get active promotions (public endpoint)
 */
export const getActivePromotions = async (req: Request, res: Response): Promise<void> => {
  try {
    const { providerId, categoryId, subcategoryId, serviceId } = req.query;

    const filters: any = {};
    if (providerId) filters.providerId = providerId as string;
    if (categoryId) filters.categoryId = categoryId as string;
    if (subcategoryId) filters.subcategoryId = subcategoryId as string;
    if (serviceId) filters.serviceId = serviceId as string;

    const promotions = await PromotionService.getActivePromotions(filters);

    res.status(200).json({
      status: true,
      message: 'Active promotions retrieved successfully',
      data: promotions,
    });
  } catch (error) {
    console.error('Error fetching active promotions:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch active promotions',
    });
  }
};

/**
 * Apply promotion to calculate discount
 */
export const applyPromotion = async (req: Request, res: Response) => {
  try {
    const { promotionId, orderAmount, serviceIds } = req.body;

    if (!promotionId || orderAmount === undefined) {
      return res.status(400).json({
        status: false,
        message: "Promotion ID and order amount are required",
      });
    }

    const result = await PromotionService.applyPromotion(
      promotionId,
      orderAmount,
      serviceIds
    );

    if (result.isValid) {
      return res.status(200).json({
        status: true,
        message: "Promotion applied successfully",
        data: {
          discountAmount: result.discountAmount,
          finalAmount: result.finalAmount,
        },
      });
    } else {
      return res.status(400).json({
        status: false,
        message: result.message,
      });
    }
  } catch (error: any) {
    console.error("Error applying promotion:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// Apply promotion by code to calculate discount
export const applyPromotionByCode = async (req: Request, res: Response) => {
  try {
    const { code, orderAmount, serviceIds, categoryIds, subcategoryIds } = req.body;

    if (!code || orderAmount === undefined) {
      return res.status(400).json({
        status: false,
        message: "Promo code and order amount are required",
      });
    }

    const result = await PromotionService.applyPromotionByCode(
      code,
      orderAmount,
      serviceIds,
      categoryIds,
      subcategoryIds
    );

    if (result.isValid) {
      return res.status(200).json({
        status: true,
        message: "Promotion applied successfully",
        data: {
          promotion: result.promotion,
          discountAmount: result.discountAmount,
          finalAmount: result.finalAmount,
        },
      });
    } else {
      return res.status(400).json({
        status: false,
        message: result.message,
      });
    }
  } catch (error: any) {
    console.error("Error applying promotion by code:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

/**
 * Update promotion
 */
export const updatePromotion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { promotionId } = req.params;
    const updateData = req.body;

    // Convert numeric fields
    if (updateData.discountValue !== undefined) {
      updateData.discountValue = parseFloat(updateData.discountValue);
    }
    if (updateData.minOrderAmount !== undefined) {
      updateData.minOrderAmount = parseFloat(updateData.minOrderAmount);
    }
    if (updateData.maxDiscountAmount !== undefined) {
      updateData.maxDiscountAmount = parseFloat(updateData.maxDiscountAmount);
    }
    if (updateData.usageLimit !== undefined) {
      updateData.usageLimit = parseInt(updateData.usageLimit);
    }
    if (updateData.startDate) {
      updateData.startDate = new Date(updateData.startDate);
    }
    if (updateData.endDate) {
      updateData.endDate = new Date(updateData.endDate);
    }

    const promotion = await PromotionService.updatePromotion(
      promotionId,
      req.userId,
      updateData
    );

    res.status(200).json({
      status: true,
      message: 'Promotion updated successfully',
      data: promotion,
    });
  } catch (error) {
    console.error('Error updating promotion:', error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : 'Failed to update promotion',
    });
  }
};

/**
 * Delete promotion
 */
export const deletePromotion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { promotionId } = req.params;

    await PromotionService.deletePromotion(promotionId, req.userId);

    res.status(200).json({
      status: true,
      message: 'Promotion deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting promotion:', error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : 'Failed to delete promotion',
    });
  }
};

/**
 * Get promotion statistics
 */
export const getPromotionStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const stats = await PromotionService.getPromotionStats(req.userId);

    res.status(200).json({
      status: true,
      message: 'Promotion statistics retrieved successfully',
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching promotion stats:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch promotion statistics',
    });
  }
};

/**
 * Get promotion by ID
 */
export const getPromotionById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { promotionId } = req.params;

    const promotion = await PromotionService.getProviderPromotions(req.userId, 1, 1, {});
    const foundPromotion = promotion.promotions.find(p => p.id === promotionId);

    if (!foundPromotion) {
      res.status(404).json({
        status: false,
        message: 'Promotion not found',
      });
      return;
    }

    res.status(200).json({
      status: true,
      message: 'Promotion retrieved successfully',
      data: foundPromotion,
    });
  } catch (error) {
    console.error('Error fetching promotion:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch promotion',
    });
  }
};
