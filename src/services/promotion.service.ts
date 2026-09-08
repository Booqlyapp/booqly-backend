import { User } from '../models/user_model';
import { Promotion } from '../models/promotion_model';
import { Category } from '../models/category_model';
import { Subcategory } from '../models/subcategory_model';
import { Service } from '../models/service_model';
import { Marketplace } from '../models/marketplace_model';
import { SubscriptionService } from './subscription.service';
import { SubscriptionError } from '../utils/errors';
import { Op } from 'sequelize';

export class PromotionService {
  
  /**
   * Create a new promotion
   */
  static async createPromotion(providerId: string, promotionData: {
    name: string;
    description?: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    minOrderAmount?: number;
    maxDiscountAmount?: number;
    categoryId?: string;
    subcategoryId?: string;
    serviceIds?: string[];
    usageLimit?: number;
    startDate: Date;
    endDate: Date;
  }): Promise<Promotion> {
    try {
      const provider = await User.findByPk(providerId);
      if (!provider) {
        throw new Error('Provider not found');
      }

      if (provider.role !== 'solo' && provider.role !== 'suite') {
        throw new Error('Only providers can create promotions');
      }

      // Check if provider has access to promotion features
      const hasAccess = await SubscriptionService.hasFeatureAccess(providerId, 'promotions_deals');
      if (!hasAccess) {
        throw new SubscriptionError('Promotion feature requires Pro or Premium subscription');
      }

      // Validate promotion data
      this.validatePromotionData(promotionData);

      // Verify category and subcategory exist if provided
      if (promotionData.categoryId) {
        const category = await Category.findByPk(promotionData.categoryId);
        if (!category) {
          throw new Error('Category not found');
        }
      }

      if (promotionData.subcategoryId) {
        const subcategory = await Subcategory.findByPk(promotionData.subcategoryId);
        if (!subcategory) {
          throw new Error('Subcategory not found');
        }
      }

      // Verify services belong to the provider if specified
      if (promotionData.serviceIds && promotionData.serviceIds.length > 0) {
        const services = await Service.findAll({
          where: {
            id: { [Op.in]: promotionData.serviceIds },
          },
          include: [{
            model: Marketplace,
            as: 'marketplace',
            where: { userId: providerId },
          }],
        });

        if (services.length !== promotionData.serviceIds.length) {
          throw new Error('Some services do not belong to this provider');
        }
      }

      // Create promotion
      const promotion = await Promotion.create({
        providerId,
        name: promotionData.name,
        description: promotionData.description || null,
        discountType: promotionData.discountType,
        discountValue: promotionData.discountValue,
        minOrderAmount: promotionData.minOrderAmount || null,
        maxDiscountAmount: promotionData.maxDiscountAmount || null,
        categoryId: promotionData.categoryId || null,
        subcategoryId: promotionData.subcategoryId || null,
        serviceIds: promotionData.serviceIds || null,
        usageLimit: promotionData.usageLimit || null,
        usedCount: 0,
        startDate: promotionData.startDate,
        endDate: promotionData.endDate,
        isActive: true,
      });

      return promotion;
    } catch (error) {
      console.error('Error creating promotion:', error);
      throw error;
    }
  }

  /**
   * Get promotions for a provider
   */
  static async getProviderPromotions(
    providerId: string,
    page: number = 1,
    limit: number = 20,
    filters?: {
      isActive?: boolean;
      categoryId?: string;
      subcategoryId?: string;
    }
  ) {
    try {
      const offset = (page - 1) * limit;
      const whereClause: any = { providerId };

      if (filters?.isActive !== undefined) {
        whereClause.isActive = filters.isActive;
      }

      if (filters?.categoryId) {
        whereClause.categoryId = filters.categoryId;
      }

      if (filters?.subcategoryId) {
        whereClause.subcategoryId = filters.subcategoryId;
      }

      const { count, rows: promotions } = await Promotion.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: Category,
            as: 'category',
            attributes: ['id', 'name'],
            required: false,
          },
          {
            model: Subcategory,
            as: 'subcategory',
            attributes: ['id', 'name'],
            required: false,
          },
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });

      return {
        promotions,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
      };
    } catch (error) {
      console.error('Error fetching provider promotions:', error);
      throw error;
    }
  }

  /**
   * Get active promotions for a service/category
   */
  static async getActivePromotions(filters: {
    providerId?: string;
    categoryId?: string;
    subcategoryId?: string;
    serviceId?: string;
  }) {
    try {
      const whereClause: any = {
        isActive: true,
        startDate: { [Op.lte]: new Date() },
        endDate: { [Op.gte]: new Date() },
      };

      if (filters.providerId) {
        whereClause.providerId = filters.providerId;
      }

      if (filters.categoryId) {
        whereClause[Op.or] = [
          { categoryId: filters.categoryId },
          { categoryId: null }, // Global promotions
        ];
      }

      if (filters.subcategoryId) {
        whereClause[Op.or] = [
          { subcategoryId: filters.subcategoryId },
          { subcategoryId: null }, // Category-wide or global promotions
        ];
      }

      if (filters.serviceId) {
        whereClause[Op.or] = [
          { serviceIds: { [Op.contains]: [filters.serviceId] } },
          { serviceIds: null }, // Category-wide or global promotions
        ];
      }

      const promotions = await Promotion.findAll({
        where: whereClause,
        include: [
          {
            model: User,
            as: 'provider',
            attributes: ['id', 'name', 'businessName'],
          },
          {
            model: Category,
            as: 'category',
            attributes: ['id', 'name'],
            required: false,
          },
          {
            model: Subcategory,
            as: 'subcategory',
            attributes: ['id', 'name'],
            required: false,
          },
        ],
        order: [['discountValue', 'DESC']],
      });

      return promotions;
    } catch (error) {
      console.error('Error fetching active promotions:', error);
      throw error;
    }
  }

  /**
   * Apply promotion to calculate discount
   */
  static async applyPromotion(
    promotionId: string,
    orderAmount: number,
    serviceIds?: string[]
  ): Promise<{
    isValid: boolean;
    discountAmount: number;
    finalAmount: number;
    message?: string;
  }> {
    try {
      const promotion = await Promotion.findByPk(promotionId);

      if (!promotion) {
        return {
          isValid: false,
          discountAmount: 0,
          finalAmount: orderAmount,
          message: 'Promotion not found',
        };
      }

      // Check if promotion is active
      if (!promotion.isActive) {
        return {
          isValid: false,
          discountAmount: 0,
          finalAmount: orderAmount,
          message: 'Promotion is not active',
        };
      }

      // Check if promotion is within date range
      const now = new Date();
      if (now < promotion.startDate || now > promotion.endDate) {
        return {
          isValid: false,
          discountAmount: 0,
          finalAmount: orderAmount,
          message: 'Promotion has expired or not yet started',
        };
      }

      // Check usage limit
      if (promotion.usageLimit && promotion.usedCount >= promotion.usageLimit) {
        return {
          isValid: false,
          discountAmount: 0,
          finalAmount: orderAmount,
          message: 'Promo code usage limit reached',
        };
      }

      // Check minimum order amount
      if (promotion.minOrderAmount && orderAmount < promotion.minOrderAmount) {
        return {
          isValid: false,
          discountAmount: 0,
          finalAmount: orderAmount,
          message: `Minimum order amount is $${promotion.minOrderAmount}`,
        };
      }

      // Check if services are applicable
      if (promotion.serviceIds && serviceIds) {
        const applicableServices = serviceIds.filter(id => 
          promotion.serviceIds!.includes(id)
        );
        if (applicableServices.length === 0) {
          return {
            isValid: false,
            discountAmount: 0,
            finalAmount: orderAmount,
            message: 'Promo code not applicable to selected services',
          };
        }
      }

      // Calculate discount
      let discountAmount = 0;
      if (promotion.discountType === 'percentage') {
        discountAmount = (orderAmount * promotion.discountValue) / 100;
        
        // Apply maximum discount limit if set
        if (promotion.maxDiscountAmount && discountAmount > promotion.maxDiscountAmount) {
          discountAmount = promotion.maxDiscountAmount;
        }
      } else {
        discountAmount = Math.min(promotion.discountValue, orderAmount);
      }

      const finalAmount = Math.max(0, orderAmount - discountAmount);

      return {
        isValid: true,
        discountAmount,
        finalAmount,
        message: 'Promotion applied successfully',
      };
    } catch (error) {
      console.error('Error applying promotion:', error);
      return {
        isValid: false,
        discountAmount: 0,
        finalAmount: orderAmount,
        message: 'Error applying promotion',
      };
    }
  }

  /**
   * Apply promotion by code to calculate discount
   */
  static async applyPromotionByCode(
    code: string,
    orderAmount: number,
    serviceIds?: string[],
    categoryIds?: string[],
    subcategoryIds?: string[]
  ): Promise<{
    isValid: boolean;
    discountAmount: number;
    finalAmount: number;
    message?: string;
    promotion?: any;
  }> {
    try {
      console.log('🔍 Applying promotion by code:', {
        code,
        orderAmount,
        serviceIds,
        categoryIds,
        subcategoryIds
      });
      // Find promotion by name (code)
      const promotion = await Promotion.findOne({
        where: {
          name: code,
          isActive: true,
        },
        include: [
          {
            model: User,
            as: 'provider',
            attributes: ['id', 'name'],
          },
        ],
      });

      if (!promotion) {
        console.log('❌ Promotion not found for code:', code);
        return {
          isValid: false,
          discountAmount: 0,
          finalAmount: orderAmount,
          message: 'Invalid or expired promo code',
        };
      }

      console.log('✅ Found promotion:', {
        id: promotion.id,
        name: promotion.name,
        categoryId: promotion.categoryId,
        subcategoryId: promotion.subcategoryId,
        serviceIds: promotion.serviceIds
      });

      // Check if promotion is within date range
      const now = new Date();
      if (promotion.startDate && now < promotion.startDate) {
        return {
          isValid: false,
          discountAmount: 0,
          finalAmount: orderAmount,
          message: 'Promo code has not started yet',
        };
      }

      if (promotion.endDate && now > promotion.endDate) {
        return {
          isValid: false,
          discountAmount: 0,
          finalAmount: orderAmount,
          message: 'Promo code has expired',
        };
      }

      // Check usage limit
      if (promotion.usageLimit && promotion.usedCount >= promotion.usageLimit) {
        return {
          isValid: false,
          discountAmount: 0,
          finalAmount: orderAmount,
          message: 'Promo code usage limit reached',
        };
      }

      // Check minimum order amount
      if (promotion.minOrderAmount && orderAmount < promotion.minOrderAmount) {
        return {
          isValid: false,
          discountAmount: 0,
          finalAmount: orderAmount,
          message: `Minimum order amount is $${promotion.minOrderAmount}`,
        };
      }

      // Check category/subcategory/service applicability
      let isApplicable = true;
      let applicabilityMessage = '';

      console.log('🔍 Checking applicability:', {
        promotionServiceIds: promotion.serviceIds,
        promotionCategoryId: promotion.categoryId,
        promotionSubcategoryId: promotion.subcategoryId,
        requestServiceIds: serviceIds,
        requestCategoryIds: categoryIds,
        requestSubcategoryIds: subcategoryIds
      });

      // If promotion has specific services, check if any selected services match
      if (promotion.serviceIds && serviceIds && serviceIds.length > 0) {
        const applicableServices = serviceIds.filter(id => 
          promotion.serviceIds!.includes(id)
        );
        console.log('🔍 Service check:', { applicableServices });
        if (applicableServices.length === 0) {
          isApplicable = false;
          applicabilityMessage = 'Promo code not applicable to selected services';
        }
      }
      // If promotion doesn't have specific services, check categories and subcategories
      else {
        // Check category if specified
        if (promotion.categoryId && categoryIds && categoryIds.length > 0) {
          const categoryMatch = categoryIds.includes(promotion.categoryId);
          console.log('🔍 Category check:', { categoryMatch, promotionCategoryId: promotion.categoryId, categoryIds });
          if (!categoryMatch) {
            isApplicable = false;
            applicabilityMessage = 'Promo code not applicable to selected service categories';
          }
        }
        
        // Check subcategory if specified (and category check passed)
        if (isApplicable && promotion.subcategoryId && subcategoryIds && subcategoryIds.length > 0) {
          const subcategoryMatch = subcategoryIds.includes(promotion.subcategoryId);
          console.log('🔍 Subcategory check:', { subcategoryMatch, promotionSubcategoryId: promotion.subcategoryId, subcategoryIds });
          if (!subcategoryMatch) {
            isApplicable = false;
            applicabilityMessage = 'Promo code not applicable to selected service subcategories';
          }
        }
      }

      console.log('🔍 Final applicability result:', { isApplicable, applicabilityMessage });

      if (!isApplicable) {
        return {
          isValid: false,
          discountAmount: 0,
          finalAmount: orderAmount,
          message: applicabilityMessage,
        };
      }

      // Calculate discount
      let discountAmount = 0;
      if (promotion.discountType === 'percentage') {
        discountAmount = (orderAmount * promotion.discountValue) / 100;
        
        // Apply maximum discount limit if set
        if (promotion.maxDiscountAmount && discountAmount > promotion.maxDiscountAmount) {
          discountAmount = promotion.maxDiscountAmount;
        }
      } else {
        discountAmount = Math.min(promotion.discountValue, orderAmount);
      }

      const finalAmount = Math.max(0, orderAmount - discountAmount);

      return {
        isValid: true,
        discountAmount,
        finalAmount,
        message: 'Promotion applied successfully',
        promotion: promotion.toJSON(),
      };
    } catch (error) {
      console.error('Error applying promotion by code:', error);
      return {
        isValid: false,
        discountAmount: 0,
        finalAmount: orderAmount,
        message: 'Error applying promotion',
      };
    }
  }

  /**
   * Update promotion usage count
   */
  static async incrementPromotionUsage(promotionId: string): Promise<void> {
    try {
      await Promotion.increment('usedCount', {
        where: { id: promotionId },
      });
    } catch (error) {
      console.error('Error incrementing promotion usage:', error);
      throw error;
    }
  }

  /**
   * Update promotion
   */
  static async updatePromotion(
    promotionId: string,
    providerId: string,
    updateData: Partial<{
      name: string;
      description: string;
      discountType: 'percentage' | 'fixed';
      discountValue: number;
      minOrderAmount: number;
      maxDiscountAmount: number;
      categoryId: string;
      subcategoryId: string;
      serviceIds: string[];
      usageLimit: number;
      startDate: Date;
      endDate: Date;
      isActive: boolean;
    }>
  ): Promise<Promotion> {
    try {
      const promotion = await Promotion.findOne({
        where: { id: promotionId, providerId },
      });

      if (!promotion) {
        throw new Error('Promotion not found or access denied');
      }

      // Validate update data if provided
      if (updateData.discountType || updateData.discountValue !== undefined) {
        this.validatePromotionData({
          discountType: updateData.discountType || promotion.discountType,
          discountValue: updateData.discountValue !== undefined ? updateData.discountValue : promotion.discountValue,
          startDate: updateData.startDate || promotion.startDate,
          endDate: updateData.endDate || promotion.endDate,
        } as any);
      }

      await promotion.update(updateData);

      return promotion;
    } catch (error) {
      console.error('Error updating promotion:', error);
      throw error;
    }
  }

  /**
   * Delete promotion
   */
  static async deletePromotion(promotionId: string, providerId: string): Promise<void> {
    try {
      const promotion = await Promotion.findOne({
        where: { id: promotionId, providerId },
      });

      if (!promotion) {
        throw new Error('Promotion not found or access denied');
      }

      await promotion.destroy();
    } catch (error) {
      console.error('Error deleting promotion:', error);
      throw error;
    }
  }

  /**
   * Get promotion statistics for a provider
   */
  static async getPromotionStats(providerId: string) {
    try {
      const totalPromotions = await Promotion.count({
        where: { providerId },
      });

      const activePromotions = await Promotion.count({
        where: {
          providerId,
          isActive: true,
          startDate: { [Op.lte]: new Date() },
          endDate: { [Op.gte]: new Date() },
        },
      });

      const totalUsage = await Promotion.sum('usedCount', {
        where: { providerId },
      });

      // Get most used promotions
      const topPromotions = await Promotion.findAll({
        where: { providerId },
        order: [['usedCount', 'DESC']],
        limit: 5,
        attributes: ['id', 'name', 'usedCount', 'discountType', 'discountValue'],
      });

      return {
        totalPromotions,
        activePromotions,
        totalUsage: totalUsage || 0,
        topPromotions,
      };
    } catch (error) {
      console.error('Error fetching promotion stats:', error);
      throw error;
    }
  }

  /**
   * Validate promotion data
   */
  private static validatePromotionData(data: {
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    startDate: Date;
    endDate: Date;
    minOrderAmount?: number;
    maxDiscountAmount?: number;
  }): void {
    if (data.discountValue <= 0) {
      throw new Error('Discount value must be greater than 0');
    }

    if (data.discountType === 'percentage' && data.discountValue > 100) {
      throw new Error('Percentage discount cannot exceed 100%');
    }

    if (data.startDate >= data.endDate) {
      throw new Error('End date must be after start date');
    }

    if (data.minOrderAmount && data.minOrderAmount < 0) {
      throw new Error('Minimum order amount cannot be negative');
    }

    if (data.maxDiscountAmount && data.maxDiscountAmount < 0) {
      throw new Error('Maximum discount amount cannot be negative');
    }

    if (data.discountType === 'percentage' && data.maxDiscountAmount && data.maxDiscountAmount <= 0) {
      throw new Error('Maximum discount amount must be greater than 0 for percentage discounts');
    }
  }
}
