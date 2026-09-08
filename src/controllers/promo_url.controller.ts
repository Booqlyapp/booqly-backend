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
  marketplace?: Marketplace & {
    services?: (Service & {
      category?: Category;
      subcategory?: Subcategory;
    })[];
  };
}

/**
 * Generate a shareable promo URL
 */
export const generatePromoUrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { promotionId } = req.body;

    if (!promotionId) {
      res.status(400).json({
        status: false,
        message: 'Promotion ID is required',
      });
      return;
    }

    // Get promotion details
    const result = await PromotionService.getProviderPromotions(req.userId, 1, 100, {});
    const promotion = result.promotions.find(p => p.id === promotionId);

    if (!promotion) {
      res.status(404).json({
        status: false,
        message: 'Promotion not found',
      });
      return;
    }

    // Build promo URL
    const baseUrl = process.env.API_BASE_URL || 'https://api.booqlyapp.com';
    const promoUrl = new URL('/promo', baseUrl);
    
    promoUrl.searchParams.set('code', promotion.name);
    promoUrl.searchParams.set('provider', promotion.providerId);
    
    if (promotion.categoryId) {
      promoUrl.searchParams.set('category', promotion.categoryId);
    }
    
    if (promotion.subcategoryId) {
      promoUrl.searchParams.set('subcategory', promotion.subcategoryId);
    }
    
    if (promotion.serviceIds && promotion.serviceIds.length > 0) {
      promoUrl.searchParams.set('services', promotion.serviceIds.join(','));
    }

    res.status(200).json({
      status: true,
      message: 'Promo URL generated successfully',
      data: {
        url: promoUrl.toString(),
        promotion: promotion,
      },
    });
  } catch (error) {
    console.error('Error generating promo URL:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to generate promo URL',
    });
  }
};

/**
 * Handle promo URL and return promotion details with provider info
 */
export const handlePromoUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, provider, category, subcategory, services } = req.query;

    if (!code || !provider) {
      res.status(400).json({
        status: false,
        message: 'Promo code and provider ID are required',
      });
      return;
    }

    // Get promotion by code and provider
    const promotions = await PromotionService.getActivePromotions({
      providerId: provider as string,
    });

    const promotion = promotions.find(p => p.name === code);

    if (!promotion) {
      res.status(404).json({
        status: false,
        message: 'Promotion not found or expired',
      });
      return;
    }

    // Get provider details with marketplace
    const providerUser = await User.findByPk(provider as string, {
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

    // Filter services based on promotion criteria
    let applicableServices = providerUser.marketplace.services || [];

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

    // Build response data for app deep linking
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
        rating: (providerUser.marketplace as any).rating,
        reviewCount: (providerUser.marketplace as any).reviewCount,
      },
      services: applicableServices.map((service: any) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        price: service.price,
        duration: service.duration,
        category: service.categoryModel?.name,
        subcategory: service.subcategoryModel?.name,
        categoryId: service.categoryId,
        subcategoryId: service.subcategoryId,
      })),
      deepLink: {
        action: 'book_with_promo',
        providerId: providerUser.id,
        marketplaceId: providerUser.marketplace.id,
        promoCode: promotion.name,
        serviceIds: promotion.serviceIds,
        categoryId: promotion.categoryId,
        subcategoryId: promotion.subcategoryId,
      },
    };

    res.status(200).json({
      status: true,
      message: 'Promo details retrieved successfully',
      data: responseData,
    });
  } catch (error) {
    console.error('Error handling promo URL:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({
      status: false,
      message: 'Failed to process promo URL',
      error: process.env.NODE_ENV === 'development' ? error : undefined,
    });
  }
};

/**
 * Generate share message for promo
 */
export const generateShareMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const { promotionId, platform } = req.body;

    if (!promotionId) {
      res.status(400).json({
        status: false,
        message: 'Promotion ID is required',
      });
      return;
    }

    // Get promotion details
    const result = await PromotionService.getProviderPromotions(req.userId, 1, 100, {});
    const promotion = result.promotions.find(p => p.id === promotionId);

    if (!promotion) {
      res.status(404).json({
        status: false,
        message: 'Promotion not found',
      });
      return;
    }

    // Get provider details
    const provider = await User.findByPk(req.userId, {
      include: [
        {
          model: Marketplace,
          as: 'marketplace',
        },
      ],
    }) as UserWithMarketplace | null;

    if (!provider || !provider.marketplace) {
      res.status(404).json({
        status: false,
        message: 'Provider or marketplace not found',
      });
      return;
    }

    // Generate promo URL
    const baseUrl = process.env.API_BASE_URL || 'https://api.booqlyapp.com';
    const promoUrl = new URL('/promo', baseUrl);
    
    promoUrl.searchParams.set('code', promotion.name);
    promoUrl.searchParams.set('provider', promotion.providerId);
    
    if (promotion.categoryId) {
      promoUrl.searchParams.set('category', promotion.categoryId);
    }
    
    if (promotion.subcategoryId) {
      promoUrl.searchParams.set('subcategory', promotion.subcategoryId);
    }
    
    if (promotion.serviceIds && promotion.serviceIds.length > 0) {
      promoUrl.searchParams.set('services', promotion.serviceIds.join(','));
    }

    // Generate platform-specific messages
    const businessName = provider.marketplace.businessName || provider.businessName || provider.name;
    const discountText = promotion.discountType === 'percentage' 
      ? `${promotion.discountValue}% OFF` 
      : `$${promotion.discountValue} OFF`;

    let message = '';
    let subject = '';

    switch (platform) {
      case 'whatsapp':
        message = `🎉 *Special Offer from ${businessName}!*\n\n` +
                 `Get ${discountText} with promo code: *${promotion.name}*\n\n` +
                 `${promotion.description ? promotion.description + '\n\n' : ''}` +
                 `Book now: ${promoUrl.toString()}\n\n` +
                 `Valid until ${new Date(promotion.endDate).toLocaleDateString()}`;
        break;

      case 'sms':
        message = `${businessName}: Get ${discountText} with code ${promotion.name}! ` +
                 `Book now: ${promoUrl.toString()} ` +
                 `Valid until ${new Date(promotion.endDate).toLocaleDateString()}`;
        break;

      case 'email':
        subject = `Special Offer: ${discountText} at ${businessName}`;
        message = `Hi there!\n\n` +
                 `I'm excited to offer you ${discountText} on your next appointment!\n\n` +
                 `Use promo code: ${promotion.name}\n` +
                 `${promotion.description ? promotion.description + '\n\n' : ''}` +
                 `Book your appointment here: ${promoUrl.toString()}\n\n` +
                 `This offer is valid until ${new Date(promotion.endDate).toLocaleDateString()}.\n\n` +
                 `Looking forward to seeing you!\n` +
                 `${businessName}`;
        break;

      default:
        message = `Get ${discountText} at ${businessName} with promo code ${promotion.name}! ` +
                 `Book now: ${promoUrl.toString()}`;
        break;
    }

    res.status(200).json({
      status: true,
      message: 'Share message generated successfully',
      data: {
        message,
        subject,
        url: promoUrl.toString(),
        platform,
      },
    });
  } catch (error) {
    console.error('Error generating share message:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to generate share message',
    });
  }
};
