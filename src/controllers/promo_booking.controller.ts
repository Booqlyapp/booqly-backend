import { Request, Response } from 'express';
import { PromotionService } from '../services/promotion.service';
import { User } from '../models/user_model';
import { Marketplace } from '../models/marketplace_model';
import { Service } from '../models/service_model';
import { Category } from '../models/category_model';
import { Subcategory } from '../models/subcategory_model';

interface AuthRequest extends Request {
  user?: any;
  userId?: string;
}

interface UserWithMarketplace extends User {
  marketplace?: any;
}

/**
 * Get comprehensive promo booking data
 * This endpoint provides all data needed for the booking flow
 */
export const getPromoBookingData = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, provider: providerId, category, subcategory, services: servicesParam } = req.query;

    if (!code || !providerId) {
      res.status(400).json({
        status: false,
        message: 'Promo code and provider ID are required',
      });
      return;
    }

    // Get promotion by code and provider
    const promotions = await PromotionService.getActivePromotions({
      providerId: providerId as string,
    });

    const promotion = promotions.find(p => p.name === code);

    if (!promotion) {
      res.status(404).json({
        status: false,
        message: 'Promotion not found or expired',
      });
      return;
    }

    // Get provider details with marketplace and all services
    const providerUser = await User.findByPk(providerId as string, {
      include: [
        {
          model: Marketplace,
          as: 'marketplace',
          include: [
            {
              model: Service,
              as: 'services',
              include: [
                {
                  model: Category,
                  as: 'categoryModel',
                  attributes: ['id', 'name'],
                },
                {
                  model: Subcategory,
                  as: 'subcategoryModel',
                  attributes: ['id', 'name'],
                },
              ],
            },
          ],
        },
      ],
    }) as UserWithMarketplace | null;

    if (!providerUser || !providerUser.marketplace) {
      res.status(404).json({
        status: false,
        message: 'Provider or marketplace not found',
      });
      return;
    }

    // Get all services from marketplace
    let allServices = providerUser.marketplace.services || [];
    
    // Filter services based on promotion criteria
    let applicableServices = [...allServices];

    if (promotion.serviceIds && promotion.serviceIds.length > 0) {
      applicableServices = applicableServices.filter((service: any) => 
        promotion.serviceIds!.includes(service.id)
      );
    } else if (promotion.subcategoryId) {
      applicableServices = applicableServices.filter((service: any) => 
        service.subcategoryId === promotion.subcategoryId
      );
    } else if (promotion.categoryId) {
      applicableServices = applicableServices.filter((service: any) => 
        service.categoryId === promotion.categoryId
      );
    }

    // Build comprehensive response data for booking
    const responseData = {
      promotion: {
        id: promotion.id,
        name: promotion.name,
        description: promotion.description,
        discountType: promotion.discountType,
        discountValue: promotion.discountValue,
        minOrderAmount: promotion.minOrderAmount,
        maxDiscountAmount: promotion.maxDiscountAmount,
        validUntil: promotion.endDate,
        startDate: promotion.startDate,
        endDate: promotion.endDate,
        usageLimit: promotion.usageLimit,
        usedCount: promotion.usedCount,
        categoryId: promotion.categoryId,
        subcategoryId: promotion.subcategoryId,
        serviceIds: promotion.serviceIds,
        isActive: promotion.isActive,
        discountDisplayText: promotion.discountType === 'percentage' 
          ? `${promotion.discountValue}% OFF` 
          : `$${promotion.discountValue} OFF`,
      },
      provider: {
        id: providerUser.id,
        name: providerUser.name,
        businessName: providerUser.businessName,
        profilePic: providerUser.profilePic,
        role: providerUser.role,
        email: providerUser.email,
        phone: providerUser.phone,
      },
      marketplace: {
        id: (providerUser.marketplace as any).id,
        businessName: (providerUser.marketplace as any).businessName,
        description: (providerUser.marketplace as any).description,
        address: (providerUser.marketplace as any).address,
        city: (providerUser.marketplace as any).city,
        state: (providerUser.marketplace as any).state,
        zipCode: (providerUser.marketplace as any).zipCode,
        phone: (providerUser.marketplace as any).phone,
        email: (providerUser.marketplace as any).email,
        profilePic: (providerUser.marketplace as any).profilePic,
        coverPic: (providerUser.marketplace as any).coverPic,
        rating: (providerUser.marketplace as any).rating || 0,
        reviewCount: (providerUser.marketplace as any).reviewCount || 0,
        latitude: (providerUser.marketplace as any).latitude || 0,
        longitude: (providerUser.marketplace as any).longitude || 0,
        isActive: (providerUser.marketplace as any).isActive !== false,
        userId: providerUser.id,
        createdAt: (providerUser.marketplace as any).createdAt,
        updatedAt: (providerUser.marketplace as any).updatedAt,
      },
      services: applicableServices.map((service: any) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        price: service.price,
        duration: service.duration,
        category: service.categoryModel?.name || service.category,
        subcategory: service.subcategoryModel?.name || service.subcategory,
        categoryId: service.categoryId,
        subcategoryId: service.subcategoryId,
        marketplaceId: service.marketplaceId,
        isActive: service.isActive,
        requireDeposit: service.requireDeposit,
        depositType: service.depositType,
        depositAmount: service.depositAmount,
        createdAt: service.createdAt,
        updatedAt: service.updatedAt,
      })),
      allServices: allServices.map((service: any) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        price: service.price,
        duration: service.duration,
        category: service.categoryModel?.name || service.category,
        subcategory: service.subcategoryModel?.name || service.subcategory,
        categoryId: service.categoryId,
        subcategoryId: service.subcategoryId,
        marketplaceId: service.marketplaceId,
        isActive: service.isActive,
        requireDeposit: service.requireDeposit,
        depositType: service.depositType,
        depositAmount: service.depositAmount,
        createdAt: service.createdAt,
        updatedAt: service.updatedAt,
      })),
      bookingData: {
        providerId: providerUser.id,
        marketplaceId: providerUser.marketplace.id,
        promoCode: promotion.name,
        promoId: promotion.id,
        applicableServiceIds: applicableServices.map((s: any) => s.id),
        categoryId: promotion.categoryId,
        subcategoryId: promotion.subcategoryId,
        canApplyToAllServices: !promotion.serviceIds && !promotion.categoryId && !promotion.subcategoryId,
      },
    };

    res.status(200).json({
      status: true,
      message: 'Promo booking data retrieved successfully',
      data: responseData,
    });
  } catch (error) {
    console.error('Error getting promo booking data:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({
      status: false,
      message: 'Failed to get promo booking data',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};
