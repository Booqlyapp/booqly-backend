import { Response } from "express";
import { User } from "../models/user_model";
import { Marketplace } from "../models/marketplace_model";
import { Schedule } from "../models/schedule_model";
import { Service } from "../models/service_model";
import { ServiceAddOn } from "../models/service_addon_model";
import { Social } from "../models/social_model";
import { Subscription } from "../models/subscription_model";
import { ReviewService } from "../services/review.service";
import { SubscriptionService } from "../services/subscription.service";
import { ReferralService } from "../services/referral.service";
import { localFileStorage } from "../utils/local-storage";
import { ALLOWED_MIMETYPES, MAX_FILE_SIZE, MAX_IMAGES } from "../utils/multer-config";
import { Op, Sequelize } from "sequelize";

// Interfaces for type safety
interface CreateServiceData {
  name: string;
  category: string;
  subcategory?: string;
  categoryId?: string;
  subcategoryId?: string;
  description: string;
  price: number;
  duration: string;
  requireDeposit?: boolean;
  depositType?: 'fixed' | 'percentage';
  depositAmount?: number;
  addOns?: Array<{
    title: string;
    price: number;
  }>;
}

interface CreateSocialData {
  insta?: string;
  tiktok?: string;
  facebook?: string;
  googlePlaceId?: string;
}

type UpdateMarketplaceData = Partial<{
  businessName: string;
  phoneNumber: string;
  businessEmail: string;
  address: string;
  latitude: number;
  longitude: number;
  bio: string;
  policyRules: string;
}>;

// Types for getMarketplaces
type MarketplaceWithAssociations = Marketplace & {
  services?: Service[];
  schedule?: Schedule;
  socials?: Social;
  user?: User;
};

interface MarketplaceJson {
  id: string;
  businessName: string;
  phoneNumber: string;
  businessEmail: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  bio: string | null;
  scheduleId: string;
  userId: string | null;
  schedule?: Schedule;
  socials?: Social;
  imagesList: (string | null)[] | null;
  portfolioImages: (string | null)[] | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  // Add other attributes from your model as needed
}

interface EnhancedMarketplace {
  id: string;
  businessName: string;
  phoneNumber: string;
  businessEmail: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  bio: string | null;
  scheduleId: string;
  userId: string | null;
  schedule?: Schedule;
  socials?: Social;
  imagesList: string[]; // Guaranteed non-null strings
  portfolioImages: string[]; // Guaranteed non-null strings
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  distance?: number;
  avgPrice?: number;
  averageRating?: number;
  totalReviews?: number;
  services: Pick<Service, "id" | "name" | "category" | "description" | "price" | "duration">[]; // All services with selected fields including id and duration
  // Add other attributes from your model as needed
}

interface GetMarketplacesQuery {
  lat?: string;
  lng?: string;
  radius?: string; // km, default 10
  category?: string;
  search?: string;
  page?: string; // default 1
  limit?: string; // default 10, max 50
  sortBy?: "distance" | "name" | "price"; // default "distance" if location provided
  availabilityDate?: string; // YYYY-MM-DD format
  availabilityTimeFrom?: string; // HH:MM format
  availabilityTimeTo?: string; // HH:MM format
}

interface PaginatedResponse {
  marketplaces: EnhancedMarketplace[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
  searchType: "withinRadius" | "nearest" | "global";
  originalRadius?: number; // Only if fallback used
}

// Constants (commented out as unused)
// const UPDATABLE_FIELDS = [
//   "businessName",
//   "phoneNumber", 
//   "businessEmail",
//   "address",
//   "latitude",
//   "longitude",
//   "bio",
// ] as const;

// Constants imported from multer-config

// Haversine formula to calculate distance between two lat/lng points (in km)
const calculateDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Helper function to apply premium priority sorting
const applyPremiumPrioritySort = (marketplaces: EnhancedMarketplace[], sortBy: string): EnhancedMarketplace[] => {
  // Separate premium and non-premium providers
  const premiumProviders = marketplaces.filter((mp: any) => mp.user?.isPremium === true);
  const nonPremiumProviders = marketplaces.filter((mp: any) => mp.user?.isPremium !== true);
  
  // Sort each group according to the sortBy parameter
  const sortFunction = (a: EnhancedMarketplace, b: EnhancedMarketplace) => {
    switch (sortBy) {
      case "distance":
        return (a.distance || 0) - (b.distance || 0);
      case "name":
        return (a.businessName || "").localeCompare(b.businessName || "");
      case "price":
        return (a.avgPrice || 0) - (b.avgPrice || 0);
      default:
        return 0;
    }
  };
  
  premiumProviders.sort(sortFunction);
  nonPremiumProviders.sort(sortFunction);
  
  // Premium providers appear first, followed by non-premium
  return [...premiumProviders, ...nonPremiumProviders];
};

// Helper function to add subscription status to marketplace users
const addSubscriptionStatusToMarketplaces = async (marketplaces: EnhancedMarketplace[]): Promise<EnhancedMarketplace[]> => {
  const enhancedMarketplaces = await Promise.all(
    marketplaces.map(async (marketplace) => {
      try {
        const mp = marketplace as any;
        if (mp.user && mp.user.currentSubscriptionId) {
          const activeSubscription = await Subscription.findOne({
            where: {
              id: mp.user.currentSubscriptionId,
              status: { [Op.in]: ['active', 'trialing'] }
            }
          });
          
          const hasActiveSubscription = !!activeSubscription;
          const planType = activeSubscription?.planType || null;
          const isPremium = planType === 'solo_premium';
          
          return {
            ...marketplace,
            user: {
              ...mp.user,
              hasActiveSubscription,
              planType,
              isPremium
            }
          };
        }
        if (mp.user) {
          return {
            ...marketplace,
            user: {
              ...mp.user,
              hasActiveSubscription: false,
              planType: null,
              isPremium: false
            }
          };
        }
        return marketplace;
      } catch (error) {
        console.error(`Error checking subscription for marketplace ${marketplace.id}:`, error);
        return marketplace;
      }
    })
  );
  return enhancedMarketplaces;
};

// Helper function to add review statistics to marketplaces
const addReviewStatsToMarketplaces = async (marketplaces: EnhancedMarketplace[]): Promise<EnhancedMarketplace[]> => {
  const enhancedMarketplaces = await Promise.all(
    marketplaces.map(async (marketplace) => {
      try {
        if (marketplace.userId) {
          const reviewStats = await ReviewService.getProviderReviewStats(marketplace.userId);
          return {
            ...marketplace,
            averageRating: reviewStats.averageRating || 0,
            totalReviews: reviewStats.totalReviews || 0,
          };
        }
        return {
          ...marketplace,
          averageRating: 0,
          totalReviews: 0,
        };
      } catch (error) {
        console.error(`Error fetching review stats for marketplace ${marketplace.id}:`, error);
        return {
          ...marketplace,
          averageRating: 0,
          totalReviews: 0,
        };
      }
    })
  );
  return enhancedMarketplaces;
};

export const createMarketplaceForUser = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    // Get user from authentication middleware (SECURE)
    const _userId = req.user.id;
    
    const {
      businessName,
      phoneNumber,
      businessEmail,
      address,
      latitude,
      longitude,
      bio,
      policyRules,
      schedule: scheduleRaw,
      services: servicesRaw,
      socials: socialsRaw,
    } = req.body;

    const files = req.files;

    let schedule: any;
    let services: CreateServiceData[];
    let socials: CreateSocialData[];

    try {
      schedule =
        typeof scheduleRaw === "string" ? JSON.parse(scheduleRaw) : scheduleRaw;
      services =
        typeof servicesRaw === "string" ? JSON.parse(servicesRaw) : servicesRaw;
      socials =
        typeof socialsRaw === "string" ? JSON.parse(socialsRaw) : socialsRaw;
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      return res.status(200).json({
        status: false,
        message:
          "Invalid JSON format in schedule, services, or socials. Check your Postman body.",
      });
    }

    if (!businessName || !phoneNumber) {
      return res.status(200).json({
        status: false,
        message: "businessName and phoneNumber are required.",
      });
    }

    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.mimetype.startsWith("image/")) {
          return res.status(200).json({
            status: false,
            message: `Invalid file type at index ${i}. Only images are allowed.`,
          });
        }
        if (file.size > 5 * 1024 * 1024) {
          return res.status(200).json({
            status: false,
            message: `File at index ${i} too large (max 5MB).`,
          });
        }
      }
    }

    if (!schedule) {
      return res.status(200).json({
        status: false,
        message: "Schedule data is required.",
      });
    }

    const requiredDays = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];
    for (const day of requiredDays) {
      if (!schedule[day]) {
        return res.status(200).json({
          status: false,
          message: `Missing schedule for ${day}`,
        });
      }
    }

    // User is already validated by authentication middleware
    const user = req.user;

    if (!services || !Array.isArray(services) || services.length === 0) {
      return res.status(200).json({
        status: false,
        message: "Services array is required and must not be empty.",
      });
    }

    const requiredServiceFields = [
      "name",
      "category",
      "description",
      "price",
      "duration",
    ];
    for (let i = 0; i < services.length; i++) {
      const service = services[i] as CreateServiceData;
      for (const field of requiredServiceFields) {
        if (!service[field as keyof CreateServiceData]) {
          return res.status(200).json({
            status: false,
            message: `Missing service field '${field}' in service at index ${i}`,
          });
        }
      }
    }

    const validatedSocials: CreateSocialData[] = [];
    if (socials && Array.isArray(socials) && socials.length > 0) {
      for (let i = 0; i < socials.length; i++) {
        const social = socials[i] as CreateSocialData;
        if (typeof social !== "object" || social === null) {
          return res.status(200).json({
            status: false,
            message: `Invalid social object at index ${i}`,
          });
        }
        validatedSocials.push(social);
      }
    }

    const existingMarketplace = await Marketplace.findOne({
      where: { phoneNumber },
    });

    if (existingMarketplace) {
      return res.status(200).json({
        status: false,
        message: "Marketplace with this phone number already exists.",
      });
    }

    const newSchedule = await Schedule.create({
      monday: schedule.monday,
      tuesday: schedule.tuesday,
      wednesday: schedule.wednesday,
      thursday: schedule.thursday,
      friday: schedule.friday,
      saturday: schedule.saturday,
      sunday: schedule.sunday,
    });

    const imageUrls: string[] = [];
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relativePath = `marketplace-images/${file.filename}`;
        const publicUrl = localFileStorage.getPublicUrl(relativePath);
        imageUrls.push(publicUrl);
      }
    }

    const newMarketplace = await Marketplace.create({
      businessName,
      phoneNumber,
      businessEmail: businessEmail && businessEmail.trim() !== '' ? businessEmail.trim() : null,
      address,
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
      bio,
      policyRules,
      showPolicyRules: false,
      scheduleId: newSchedule.id,
      imagesList: imageUrls.length > 0 ? imageUrls : null,
      portfolioImages: null,
    });

    // No need to rename files since they're already properly named by multer

    const _newServices = await Service.bulkCreate(
      services.map((serviceData: CreateServiceData) => ({
        ...serviceData,
        marketplaceId: newMarketplace.id,
        isActive: true,
        requireDeposit: serviceData.requireDeposit ?? false,
        depositType: serviceData.depositType,
        depositAmount: serviceData.depositAmount,
      }))
    );

    // Create add-ons for each service if provided
    console.log('=== MARKETPLACE CREATION - PROCESSING ADD-ONS ===');
    for (let i = 0; i < services.length; i++) {
      const serviceData = services[i];
      const createdService = _newServices[i];
      
      console.log(`Processing service ${i}: ${serviceData.name}`);
      console.log('Service add-ons:', serviceData.addOns);
      
      if (serviceData.addOns && Array.isArray(serviceData.addOns) && serviceData.addOns.length > 0) {
        console.log(`Creating ${serviceData.addOns.length} add-ons for service: ${serviceData.name}`);
        
        for (const addOnData of serviceData.addOns) {
          console.log('Processing add-on:', addOnData);
          
          if (addOnData.title && (typeof addOnData.price === 'number' || typeof addOnData.price === 'string') && parseFloat(addOnData.price.toString()) > 0) {
            const createdAddOn = await ServiceAddOn.create({
              serviceId: createdService.id,
              title: addOnData.title.trim(),
              price: parseFloat(addOnData.price.toString()),
              isActive: true
            });
            console.log('Created add-on:', createdAddOn.toJSON());
          } else {
            console.log('Invalid add-on data:', addOnData);
          }
        }
      } else {
        console.log(`No add-ons for service: ${serviceData.name}`);
      }
    }

    let _newSocials: Social[] = [];
    if (validatedSocials.length > 0) {
      _newSocials = await Social.bulkCreate(
        validatedSocials.map((socialData: CreateSocialData) => ({
          ...socialData,
          marketplaceId: newMarketplace.id,
        }))
      );
    }

    // Set the userId in the marketplace
    newMarketplace.userId = user.id;
    await newMarketplace.save();

    user.marketplaceId = newMarketplace.id;
    await user.save();

    const updatedUser = await User.findOne({
      where: { id: user.id },
      include: [
        {
          model: Marketplace,
          as: "marketplace",
          include: [
            {
              model: Schedule,
              as: "schedule",
            },
            {
              model: Service,
              as: "services",
              attributes: [
                'id', 'name', 'category', 'subcategory', 'categoryId', 'subcategoryId',
                'description', 'price', 'duration', 'marketplaceId', 'isActive',
                'requireDeposit', 'depositType', 'depositAmount',
                'createdAt', 'updatedAt', 'deletedAt'
              ],
            },
            {
              model: Social,
              as: "socials",
            },
          ],
        },
      ],
    });

    const responseData = { ...updatedUser?.toJSON() } as any;
    // Images are already accessible via local URLs, no signed URLs needed

    return res.status(201).json({
      status: true,
      message:
        "Marketplace, schedule, services, socials, and images created and associated with the user successfully!",
      data: responseData,
    });
  } catch (error) {
    console.error("Error creating marketplace for user:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error.",
      ...(process.env.SEND_ERRORS === 'true' && { 
        error: error instanceof Error ? error.message : "Unknown error" 
      })
    });
  }
};

export const updateMarketplace = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const body = req.body as any;
    const {
      marketplaceId,
      businessName,
      phoneNumber,
      businessEmail,
      address,
      latitude,
      longitude,
      bio,
    } = body;

    if (!marketplaceId) {
      return res.status(400).json({
        status: false,
        message: "Please pass a valid marketplace id",
      });
    }

    // Verify user owns this marketplace
    const user = req.user;
    if (user.marketplaceId !== marketplaceId) {
      return res.status(403).json({
        status: false,
        message: "You can only update your own marketplace.",
      });
    }

    const updateData: UpdateMarketplaceData = {};
    if (businessName !== undefined) updateData.businessName = businessName;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (businessEmail !== undefined) updateData.businessEmail = businessEmail && businessEmail.trim() !== '' ? businessEmail.trim() : null;
    if (address !== undefined) updateData.address = address;
    if (latitude !== undefined) updateData.latitude = Number(latitude);
    if (longitude !== undefined) updateData.longitude = Number(longitude);
    if (bio !== undefined) updateData.bio = bio;

    if (Object.keys(updateData).length === 0) {
      return res.status(200).json({
        status: false,
        message:
          "No valid fields to update. Provide at least one of: businessName, phoneNumber, businessEmail, address, latitude, longitude, bio.",
      });
    }

    if (updateData.phoneNumber) {
      const existingMarketplace = await Marketplace.findOne({
        where: {
          phoneNumber: updateData.phoneNumber,
          id: { [Op.ne]: marketplaceId },
        },
      });
      if (existingMarketplace) {
        return res.status(200).json({
          status: false,
          message: "Marketplace with this phone number already exists.",
        });
      }
    }

    const [updatedCount] = await Marketplace.update(updateData, {
      where: { id: marketplaceId, deletedAt: null },
      returning: true,
    });

    if (updatedCount === 0) {
      return res.status(200).json({
        status: false,
        message:
          "No record found for this marketplace Id or record is deleted.",
      });
    }

    const updatedMarketplace = await Marketplace.findByPk(marketplaceId);

    const responseData = { ...updatedMarketplace?.toJSON() } as any;
    
    // Images are already accessible via local URLs, no signed URLs needed

    return res.status(200).json({
      status: true,
      message: "Marketplace updated successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("Error updating marketplace data:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      ...(process.env.SEND_ERRORS === 'true' && { 
        error: error instanceof Error ? error.message : "Unknown error" 
      })
    });
  }
};

export const updateMarketplaceImages = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const { marketplaceId, existingImages } = req.body;

    const files = req.files;

    if (!marketplaceId) {
      return res.status(400).json({
        status: false,
        message: "Please pass a valid marketplace id",
      });
    }

    // Verify user owns this marketplace
    const user = req.user;
    if (user.marketplaceId !== marketplaceId) {
      return res.status(403).json({
        status: false,
        message: "You can only update your own marketplace images.",
      });
    }

    let parsedExistingImages: string[] = [];
    if (existingImages) {
      if (typeof existingImages === "string") {
        try {
          parsedExistingImages = JSON.parse(existingImages);
        } catch (parseError) {
          return res.status(200).json({
            status: false,
            message:
              "Invalid JSON format for existingImages. Must be an array of signed URLs.",
          });
        }
      } else if (Array.isArray(existingImages)) {
        parsedExistingImages = existingImages;
      } else {
        return res.status(200).json({
          status: false,
          message: "existingImages must be an array of signed URLs.",
        });
      }
    }

    if (parsedExistingImages.length > MAX_IMAGES) {
      return res.status(200).json({
        status: false,
        message: `existingImages can have at most ${MAX_IMAGES} URLs.`,
      });
    }

    const newImageUrls: string[] = [];
    if (files && files.length > 0) {
      if (files.length > MAX_IMAGES) {
        return res.status(400).json({
          status: false,
          message: `New images can have at most ${MAX_IMAGES} files.`,
        });
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
          return res.status(200).json({
            status: false,
            message: `Invalid file type at index ${i}. Only ${ALLOWED_MIMETYPES.join(
              ", "
            )} are allowed.`,
          });
        }

        if (file.size > MAX_FILE_SIZE) {
          return res.status(200).json({
            status: false,
            message: `File at index ${i} too large (max ${
              MAX_FILE_SIZE / (1024 * 1024)
            }MB).`,
          });
        }

        const relativePath = `marketplace-images/${file.filename}`;
        const publicUrl = localFileStorage.getPublicUrl(relativePath);
        newImageUrls.push(publicUrl);
      }
    }

    const currentMarketplace = await Marketplace.findByPk(marketplaceId, {
      paranoid: false,
    });

    if (!currentMarketplace) {
      return res.status(200).json({
        status: false,
        message: "Marketplace not found.",
      });
    }

    const currentImagesList = currentMarketplace.imagesList || [];

    // Delete removed images from local storage
    const keptUrls = new Set(parsedExistingImages);
    for (const currentUrl of currentImagesList) {
      if (!keptUrls.has(currentUrl)) {
        // Delete the file from local storage
        const relativePath = localFileStorage.extractRelativePath(currentUrl);
        await localFileStorage.deleteFile(relativePath);
        console.log(`Deleted removed image: ${relativePath}`);
      }
    }

    // Combine kept images with new images
    const newImagesList = [...parsedExistingImages, ...newImageUrls];

    await currentMarketplace.update({
      imagesList: newImagesList.length > 0 ? newImagesList : null,
    });

    const updatedMarketplace = await Marketplace.findByPk(marketplaceId);

    const responseData = { ...updatedMarketplace?.toJSON() } as any;
    
    // Images are already accessible via local URLs, no signed URLs needed

    return res.status(200).json({
      status: true,
      message: `Marketplace images updated successfully. Kept: ${parsedExistingImages.length}, Added: ${newImageUrls.length}, Removed: ${currentImagesList.length - parsedExistingImages.length}.`,
      data: responseData,
    });
  } catch (error) {
    console.error("Error updating marketplace images:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      ...(process.env.SEND_ERRORS === 'true' && { 
        error: error instanceof Error ? error.message : "Unknown error" 
      })
    });
  }
};

export const updateMarketplacePortfolio = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const { marketplaceId, existingPortfolioImages } = req.body;

    const files = req.files;

    if (!marketplaceId) {
      return res.status(400).json({
        status: false,
        message: "Please pass a valid marketplace id",
      });
    }

    // Verify user owns this marketplace
    const user = req.user;
    if (user.marketplaceId !== marketplaceId) {
      return res.status(403).json({
        status: false,
        message: "You can only update your own marketplace portfolio.",
      });
    }

    let parsedExistingPortfolioImages: string[] = [];
    if (existingPortfolioImages) {
      if (typeof existingPortfolioImages === "string") {
        try {
          parsedExistingPortfolioImages = JSON.parse(existingPortfolioImages);
        } catch (parseError) {
          return res.status(200).json({
            status: false,
            message:
              "Invalid JSON format for existingPortfolioImages. Must be an array of signed URLs.",
          });
        }
      } else if (Array.isArray(existingPortfolioImages)) {
        parsedExistingPortfolioImages = existingPortfolioImages;
      } else {
        return res.status(200).json({
          status: false,
          message: "existingPortfolioImages must be an array of signed URLs.",
        });
      }
    }

    if (parsedExistingPortfolioImages.length > MAX_IMAGES) {
      return res.status(200).json({
        status: false,
        message: `existingPortfolioImages can have at most ${MAX_IMAGES} URLs.`,
      });
    }

    const newPortfolioUrls: string[] = [];
    if (files && files.length > 0) {
      if (files.length > MAX_IMAGES) {
        return res.status(400).json({
          status: false,
          message: `New portfolio images can have at most ${MAX_IMAGES} files.`,
        });
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
          return res.status(200).json({
            status: false,
            message: `Invalid file type at index ${i}. Only ${ALLOWED_MIMETYPES.join(
              ", "
            )} are allowed.`,
          });
        }

        if (file.size > MAX_FILE_SIZE) {
          return res.status(200).json({
            status: false,
            message: `File at index ${i} too large (max ${
              MAX_FILE_SIZE / (1024 * 1024)
            }MB).`,
          });
        }

        const relativePath = `marketplace-portfolio/${file.filename}`;
        const publicUrl = localFileStorage.getPublicUrl(relativePath);
        newPortfolioUrls.push(publicUrl);
      }
    }

    const currentMarketplace = await Marketplace.findByPk(marketplaceId, {
      paranoid: false,
    });

    if (!currentMarketplace) {
      return res.status(200).json({
        status: false,
        message: "Marketplace not found.",
      });
    }

    const currentPortfolioImages = currentMarketplace.portfolioImages || [];

    // Delete removed images from local storage
    const keptUrls = new Set(parsedExistingPortfolioImages);
    for (const currentUrl of currentPortfolioImages) {
      if (!keptUrls.has(currentUrl)) {
        // Delete the file from local storage
        const relativePath = localFileStorage.extractRelativePath(currentUrl);
        await localFileStorage.deleteFile(relativePath);
        console.log(`Deleted removed portfolio image: ${relativePath}`);
      }
    }

    // Combine kept images with new images
    const newPortfolioImages = [...parsedExistingPortfolioImages, ...newPortfolioUrls];

    await currentMarketplace.update({
      portfolioImages: newPortfolioImages.length > 0 ? newPortfolioImages : null,
    });

    const updatedMarketplace = await Marketplace.findByPk(marketplaceId);

    const responseData = { ...updatedMarketplace?.toJSON() } as any;
    
    // Images are already accessible via local URLs, no signed URLs needed

    return res.status(200).json({
      status: true,
      message: `Portfolio images updated successfully. Kept: ${parsedExistingPortfolioImages.length}, Added: ${newPortfolioUrls.length}, Removed: ${currentPortfolioImages.length - parsedExistingPortfolioImages.length}.`,
      data: responseData,
    });
  } catch (error) {
    console.error("Error updating marketplace portfolio:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      ...(process.env.SEND_ERRORS === 'true' && { 
        error: error instanceof Error ? error.message : "Unknown error" 
      })
    });
  }
};

export const getMarketplaces = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const {
      lat,
      lng,
      radius = "10",
      category,
      search,
      page = "1",
      limit = "10",
      sortBy = "distance",
      availabilityDate,
      availabilityTimeFrom,
      availabilityTimeTo,
    } = req.query as GetMarketplacesQuery;

    const queryLat = lat ? Number(lat) : undefined;
    const queryLng = lng ? Number(lng) : undefined;
    const queryRadius = Math.max(0, Math.min(100, Number(radius)));
    const queryPage = Math.max(1, Number(page));
    const queryLimit = Math.min(50, Math.max(1, Number(limit)));
    const offset = (queryPage - 1) * queryLimit;

    if (
      (queryLat !== undefined || queryLng !== undefined) &&
      (queryLat === undefined || queryLng === undefined)
    ) {
      return res.status(200).json({
        status: false,
        message: "Both lat and lng are required for location-based search.",
      });
    }

    if (!["distance", "name", "price"].includes(sortBy)) {
      return res.status(200).json({
        status: false,
        message: "sortBy must be one of: distance, name, price.",
      });
    }

    // Validate availability parameters
    if (availabilityDate || availabilityTimeFrom || availabilityTimeTo) {
      if (!availabilityDate) {
        return res.status(200).json({
          status: false,
          message: "availabilityDate is required when filtering by availability.",
        });
      }

      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(availabilityDate)) {
        return res.status(200).json({
          status: false,
          message: "availabilityDate must be in YYYY-MM-DD format.",
        });
      }

      // Validate time format (HH:MM)
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (availabilityTimeFrom && !timeRegex.test(availabilityTimeFrom)) {
        return res.status(200).json({
          status: false,
          message: "availabilityTimeFrom must be in HH:MM format.",
        });
      }

      if (availabilityTimeTo && !timeRegex.test(availabilityTimeTo)) {
        return res.status(200).json({
          status: false,
          message: "availabilityTimeTo must be in HH:MM format.",
        });
      }

      // Validate that timeFrom is before timeTo
      if (availabilityTimeFrom && availabilityTimeTo && availabilityTimeFrom >= availabilityTimeTo) {
        return res.status(200).json({
          status: false,
          message: "availabilityTimeFrom must be before availabilityTimeTo.",
        });
      }
    }

    // Check if client has access to marketplace discovery
    if (req.userId) {
      const canDiscover = await SubscriptionService.canClientDiscoverProviders(req.userId);
      if (!canDiscover.canDiscover) {
        return res.status(403).json({
          status: false,
          message: canDiscover.reason,
        });
      }
    }

    const sanitizedCategory = category ? category.trim() : undefined;
    const sanitizedSearch = search ? search.trim() : undefined;

    const whereClause: any = { deletedAt: null };

    if (sanitizedCategory) {
      whereClause.id = {
        [Op.in]: Sequelize.literal(
          `(SELECT DISTINCT "marketplaceId" FROM "Services" WHERE LOWER("category") = LOWER('${sanitizedCategory.replace(
            /'/g,
            "''"
          )}'))`
        ),
      };
    }

    if (sanitizedSearch) {
      whereClause[Op.or] = [
        { businessName: { [Op.iLike]: `%${sanitizedSearch}%` } },
        { bio: { [Op.iLike]: `%${sanitizedSearch}%` } },
        Sequelize.literal(
          `EXISTS (SELECT 1 FROM "Services" WHERE "Services"."marketplaceId" = "Marketplace"."id" AND ("name" ILIKE '%${sanitizedSearch.replace(
            /'/g,
            "''"
          )}%' OR "description" ILIKE '%${sanitizedSearch.replace(
            /'/g,
            "''"
          )}%'))`
        ),
      ];
    }

    // Add availability filtering
    if (availabilityDate) {
      try {
        const dayOfWeek = new Date(availabilityDate).getDay(); // 0 = Sunday, 1 = Monday, etc.
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const targetDay = dayNames[dayOfWeek];

        console.log(`Filtering by availability: ${availabilityDate} (${targetDay})`);

        // Build availability subquery - check if provider is open on the target day
        let availabilityQuery = `
          "Marketplace"."scheduleId" IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM "Schedules" 
            WHERE "Schedules"."id" = "Marketplace"."scheduleId" 
            AND "Schedules"."${targetDay}" != 'Closed'
            AND "Schedules"."${targetDay}" IS NOT NULL
            AND "Schedules"."${targetDay}" != ''
        `;

        // Add time filtering if provided (simplified for now)
        if (availabilityTimeFrom || availabilityTimeTo) {
          // For time filtering, we need to parse the schedule string format "10:00 am - 7:00 pm"
          // This is a basic check - assumes schedule contains time ranges with am/pm
          availabilityQuery += `
            AND ("Schedules"."${targetDay}" LIKE '%am%' OR "Schedules"."${targetDay}" LIKE '%pm%')
          `;
        }

        availabilityQuery += `
          )
        `;

        console.log('Availability query:', availabilityQuery);

        // Add to where clause
        if (whereClause[Op.and]) {
          whereClause[Op.and].push(Sequelize.literal(availabilityQuery));
        } else {
          whereClause[Op.and] = [Sequelize.literal(availabilityQuery)];
        }
      } catch (availabilityError) {
        console.error('Error in availability filtering:', availabilityError);
        return res.status(500).json({
          status: false,
          message: 'Error processing availability filter',
        });
      }
    }

    let searchType: "withinRadius" | "nearest" | "global" = "global";
    let total = 0;
    let filteredMarketplaces: EnhancedMarketplace[] = [];

    if (queryLat && queryLng) {
      searchType = "withinRadius";

      const { count: initialCount, rows: initialMarketplaces } =
        (await Marketplace.findAndCountAll({
          where: whereClause,
          include: [
            {
              model: Service,
              as: "services",
              attributes: ["id", "name", "category", "description", "price", "duration", "requireDeposit", "depositType", "depositAmount"],
              required: sanitizedCategory ? true : false,
              include: [{
                model: ServiceAddOn,
                as: 'addOns',
                where: { deletedAt: null },
                required: false,
                attributes: ['id', 'title', 'price', 'isActive']
              }]
            },
            {
              model: Schedule,
              as: "schedule",
              attributes: ["id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
            },
            {
              model: Social,
              as: "socials",
              attributes: ["id", "insta", "tiktok", "facebook"],
            },
            {
              model: User,
              as: "user",
              attributes: [
                "id",
                "name",
                "email",
                "role",
                "currentSubscriptionId",
                "status",
                "accountVerified",
                "professionalVerified",
                "businessVerified",
              ],
            },
          ],
          limit: queryLimit,
          offset,
          order: sortBy === "name" ? [["businessName", "ASC"]] : undefined,
          paranoid: true,
        })) as { count: number; rows: MarketplaceWithAssociations[] };

      const withinRadiusResults = initialMarketplaces
        .map((mp): EnhancedMarketplace | null => {
          if (mp.latitude && mp.longitude) {
            const distance = calculateDistance(
              queryLat,
              queryLng,
              mp.latitude,
              mp.longitude
            );
            if (distance > queryRadius) return null;

            const services = mp.services || [];
            const avgPrice =
              services.length > 0
                ? Math.round(
                    services.reduce(
                      (sum: number, s: Service) => sum + (s.price || 0),
                      0
                    ) / services.length
                  )
                : undefined;

            const jsonMp = mp.toJSON() as MarketplaceJson;
            return {
              ...jsonMp,
              distance,
              avgPrice,
              services: services as Pick<
                Service,
                "id" | "name" | "category" | "description" | "price" | "duration"
              >[],
            } as EnhancedMarketplace;
          }
          return null;
        })
        .filter((mp): mp is EnhancedMarketplace => mp != null);

      withinRadiusResults.sort((a, b) => {
        switch (sortBy) {
          case "distance":
            return (a.distance || 0) - (b.distance || 0);
          case "name":
            return (a.businessName || "").localeCompare(b.businessName || "");
          case "price":
            return (a.avgPrice || 0) - (b.avgPrice || 0);
          default:
            return 0;
        }
      });

      if (withinRadiusResults.length > 0) {
        filteredMarketplaces = withinRadiusResults;
        total = initialCount;
      } else {
        searchType = "nearest";
        const MAX_FETCH_FOR_NEAREST = 1000;
        const { rows: allMarketplaces } = (await Marketplace.findAndCountAll({
          where: whereClause,
          include: [
            {
              model: Service,
              as: "services",
              attributes: ["id", "name", "category", "description", "price", "duration", "requireDeposit", "depositType", "depositAmount"],
              required: sanitizedCategory ? true : false,
              include: [{
                model: ServiceAddOn,
                as: 'addOns',
                where: { deletedAt: null },
                required: false,
                attributes: ['id', 'title', 'price', 'isActive']
              }]
            },
            {
              model: Schedule,
              as: "schedule",
              attributes: ["id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
            },
            {
              model: Social,
              as: "socials",
              attributes: ["id", "insta", "tiktok", "facebook"],
            },
            {
              model: User,
              as: "user",
              attributes: [
                "id",
                "name",
                "email",
                "role",
                "currentSubscriptionId",
                "status",
                "accountVerified",
                "professionalVerified",
                "businessVerified",
              ],
            },
          ],
          limit: MAX_FETCH_FOR_NEAREST,
          paranoid: true,
        })) as { count: number; rows: MarketplaceWithAssociations[] };

        const nearestResults = allMarketplaces
          .map((mp): EnhancedMarketplace | null => {
            if (mp.latitude && mp.longitude) {
              const distance = calculateDistance(
                queryLat,
                queryLng,
                mp.latitude,
                mp.longitude
              );

              const services = mp.services || [];
              const avgPrice =
                services.length > 0
                  ? Math.round(
                      services.reduce(
                        (sum: number, s: Service) => sum + (s.price || 0),
                        0
                      ) / services.length
                    )
                  : undefined;

              const jsonMp = mp.toJSON() as MarketplaceJson;
              return {
                ...jsonMp,
                distance,
                avgPrice,
                services: services as Pick<
                  Service,
                  "id" | "name" | "category" | "description" | "price" | "duration"
                >[],
              } as EnhancedMarketplace;
            }
            return null;
          })
          .filter((mp): mp is EnhancedMarketplace => mp != null);

        nearestResults.sort((a, b) => {
          const distDiff = (a.distance || 0) - (b.distance || 0);
          if (distDiff !== 0) return distDiff;

          switch (sortBy) {
            case "name":
              return (a.businessName || "").localeCompare(b.businessName || "");
            case "price":
              return (a.avgPrice || 0) - (b.avgPrice || 0);
            default:
              return 0;
          }
        });

        filteredMarketplaces = nearestResults.slice(
          offset,
          offset + queryLimit
        );
        total = nearestResults.length;
      }
    } else {
      searchType = "global";
      const { count, rows: marketplaces } = (await Marketplace.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: Service,
            as: "services",
            attributes: ["id", "name", "category", "description", "price", "duration", "requireDeposit", "depositType", "depositAmount"],
            required: sanitizedCategory ? true : false,
            include: [{
              model: ServiceAddOn,
              as: 'addOns',
              where: { deletedAt: null },
              required: false,
              attributes: ['id', 'title', 'price', 'isActive']
            }]
          },
          {
            model: Schedule,
            as: "schedule",
            attributes: ["id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
          },
          {
            model: Social,
            as: "socials",
            attributes: ["id", "insta", "tiktok", "facebook"],
          },
          {
            model: User,
            as: "user",
            attributes: [
              "id",
              "name",
              "email",
              "role",
              "currentSubscriptionId",
              "status",
              "accountVerified",
              "professionalVerified",
              "businessVerified",
            ],
          },
        ],
        limit: queryLimit,
        offset,
        order: sortBy === "name" ? [["businessName", "ASC"]] : undefined,
        paranoid: true,
      })) as { count: number; rows: MarketplaceWithAssociations[] };

      filteredMarketplaces = marketplaces.map((mp): EnhancedMarketplace => {
        let avgPrice: number | undefined;
        if (sortBy === "price") {
          const services = mp.services || [];
          avgPrice =
            services.length > 0
              ? Math.round(
                  services.reduce(
                    (sum: number, s: Service) => sum + (s.price || 0),
                    0
                  ) / services.length
                )
              : undefined;
        }

        const jsonMp = mp.toJSON() as MarketplaceJson;
        return {
          ...jsonMp,
          avgPrice,
          services: (mp.services || []) as Pick<
            Service,
            "id" | "name" | "category" | "description" | "price" | "duration"
          >[],
        } as EnhancedMarketplace;
      });

      if (sortBy === "price") {
        filteredMarketplaces.sort(
          (a, b) => (a.avgPrice || 0) - (b.avgPrice || 0)
        );
      }

      total = count;
    }

    // Add subscription status to marketplaces
    const marketplacesWithSubscriptions = await addSubscriptionStatusToMarketplaces(filteredMarketplaces);
    
    // Add review statistics to marketplaces
    const marketplacesWithReviews = await addReviewStatsToMarketplaces(marketplacesWithSubscriptions);

    // Apply premium priority sorting - Premium users appear first
    const sortedMarketplaces = applyPremiumPrioritySort(marketplacesWithReviews, sortBy);

    // Images are already accessible via local URLs, no signed URLs needed
    const enhancedMarketplaces: PaginatedResponse["marketplaces"] = 
      sortedMarketplaces.map((mp): EnhancedMarketplace => {
        return {
          ...mp,
          imagesList: mp.imagesList || [],
          portfolioImages: mp.portfolioImages || [],
        } as EnhancedMarketplace;
      });

    const totalPages = Math.ceil(total / queryLimit);
    const responseData: PaginatedResponse = {
      marketplaces: enhancedMarketplaces,
      pagination: {
        total,
        page: queryPage,
        limit: queryLimit,
        pages: totalPages,
      },
      searchType,
      ...(searchType === "nearest" && { originalRadius: queryRadius }),
    };

    let message = `Found ${enhancedMarketplaces.length} marketplaces.`;
    if (searchType === "withinRadius") {
      message = `Found ${enhancedMarketplaces.length} marketplaces within ${queryRadius} km.`;
    } else if (searchType === "nearest") {
      message = `Found ${enhancedMarketplaces.length} nearest marketplaces (expanded from ${queryRadius} km).`;
    }

    return res.status(200).json({
      status: true,
      message,
      data: responseData,
    });
  } catch (error) {
    console.error("Error fetching marketplaces:", error);
    console.error("Error stack:", (error as Error).stack);
    console.error("Error message:", (error as Error).message);
    return res.status(500).json({
      status: false,
      message: "Internal server error.",
      ...(process.env.SEND_ERRORS === 'true' && { 
        error: error instanceof Error ? error.message : "Unknown error" 
      })
    });
  }
};

// Update marketplace essentials (business info, contact, location)
export const updateMarketplaceEssentials = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const {
      marketplaceId,
      businessName,
      phoneNumber,
      businessEmail,
      address,
      latitude,
      longitude,
    } = req.body;

    if (!marketplaceId) {
      return res.status(400).json({
        status: false,
        message: "marketplaceId is required",
      });
    }

    // Verify user owns this marketplace
    const user = req.user;
    if (user.marketplaceId !== marketplaceId) {
      return res.status(403).json({
        status: false,
        message: "You can only update your own marketplace.",
      });
    }

    const updateData: UpdateMarketplaceData = {};
    if (businessName !== undefined) updateData.businessName = businessName;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (businessEmail !== undefined) updateData.businessEmail = businessEmail && businessEmail.trim() !== '' ? businessEmail.trim() : null;
    if (address !== undefined) updateData.address = address;
    if (latitude !== undefined) updateData.latitude = Number(latitude);
    if (longitude !== undefined) updateData.longitude = Number(longitude);

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        status: false,
        message: "No valid fields to update. Provide at least one field.",
      });
    }

    // Check for duplicate phone number
    if (updateData.phoneNumber) {
      const existingMarketplace = await Marketplace.findOne({
        where: {
          phoneNumber: updateData.phoneNumber,
          id: { [Op.ne]: marketplaceId },
        },
      });

      if (existingMarketplace) {
        return res.status(400).json({
          status: false,
          message: "Phone number already exists for another marketplace.",
        });
      }
    }

    const [updatedCount] = await Marketplace.update(updateData, {
      where: { id: marketplaceId, deletedAt: null },
      returning: true,
    });

    if (updatedCount === 0) {
      return res.status(404).json({
        status: false,
        message: "Marketplace not found or could not be updated.",
      });
    }

    const updatedMarketplace = await Marketplace.findByPk(marketplaceId);

    return res.status(200).json({
      status: true,
      message: "Marketplace essentials updated successfully",
      data: updatedMarketplace,
    });

  } catch (error) {
    console.error("Error updating marketplace essentials:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      ...(process.env.SEND_ERRORS === 'true' && { 
        error: error instanceof Error ? error.message : "Unknown error" 
      })
    });
  }
};

// Update marketplace bio only
export const updateMarketplaceBio = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const { marketplaceId, bio, policyRules } = req.body;

    if (!marketplaceId) {
      return res.status(400).json({
        status: false,
        message: "marketplaceId is required",
      });
    }

    if (bio === undefined) {
      return res.status(400).json({
        status: false,
        message: "bio is required",
      });
    }

    // Verify user owns this marketplace
    const user = req.user;
    if (user.marketplaceId !== marketplaceId) {
      return res.status(403).json({
        status: false,
        message: "You can only update your own marketplace.",
      });
    }

    const updateData: any = { bio };
    if (policyRules !== undefined) {
      updateData.policyRules = policyRules;
    }

    const [updatedCount] = await Marketplace.update(
      updateData,
      {
        where: { id: marketplaceId, deletedAt: null },
        returning: true,
      }
    );

    if (updatedCount === 0) {
      return res.status(404).json({
        status: false,
        message: "Marketplace not found or could not be updated.",
      });
    }

    const updatedMarketplace = await Marketplace.findByPk(marketplaceId);

    return res.status(200).json({
      status: true,
      message: "Marketplace bio updated successfully",
      data: updatedMarketplace,
    });

  } catch (error) {
    console.error("Error updating marketplace bio:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error.",
      ...(process.env.SEND_ERRORS === 'true' && { 
        error: error instanceof Error ? error.message : "Unknown error" 
      })
    });
  }
};

// Update marketplace policy/rules only
export const updateMarketplacePolicyRules = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const { marketplaceId, policyRules } = req.body;

    if (!marketplaceId || policyRules === undefined) {
      return res.status(400).json({
        status: false,
        message: "marketplaceId and policyRules are required.",
      });
    }

    // Get user from authentication middleware
    const user = req.user;

    // Verify user owns this marketplace
    if (user.marketplaceId !== marketplaceId) {
      return res.status(403).json({
        status: false,
        message: "You can only update your own marketplace.",
      });
    }

    const [updatedCount] = await Marketplace.update(
      { policyRules },
      {
        where: { id: marketplaceId, deletedAt: null },
        returning: true,
      }
    );

    if (updatedCount === 0) {
      return res.status(404).json({
        status: false,
        message: "Marketplace not found or no changes made.",
      });
    }

    const updatedMarketplace = await Marketplace.findByPk(marketplaceId);

    return res.status(200).json({
      status: true,
      message: "Marketplace policy/rules updated successfully",
      data: updatedMarketplace,
    });

  } catch (error) {
    console.error("Error updating marketplace policy/rules:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error.",
      ...(process.env.SEND_ERRORS === 'true' && { 
        error: error instanceof Error ? error.message : "Unknown error" 
      })
    });
  }
};

// Update marketplace custom link
export const updateMarketplaceCustomLink = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const { marketplaceId, customLink } = req.body;

    if (!marketplaceId) {
      return res.status(400).json({
        status: false,
        message: "marketplaceId is required",
      });
    }

    // Verify user owns this marketplace
    const user = req.user;
    if (user.marketplaceId !== marketplaceId) {
      return res.status(403).json({
        status: false,
        message: "You can only update your own marketplace.",
      });
    }

    // Validate custom link format
    if (customLink !== null && customLink !== undefined && customLink !== '') {
      const customLinkStr = customLink.trim().toLowerCase();
      
      // Check format: lowercase letters, numbers, hyphens only
      if (!/^[a-z0-9-]+$/.test(customLinkStr)) {
        return res.status(400).json({
          status: false,
          message: "Custom link can only contain lowercase letters, numbers, and hyphens",
        });
      }

      // Check length
      if (customLinkStr.length < 3 || customLinkStr.length > 30) {
        return res.status(400).json({
          status: false,
          message: "Custom link must be between 3 and 30 characters",
        });
      }

      // Reserved words that cannot be used
      const reservedWords = ['api', 'www', 'admin', 'app', 'mail', 'ftp', 'blog', 'shop', 'store'];
      if (reservedWords.includes(customLinkStr)) {
        return res.status(400).json({
          status: false,
          message: `"${customLinkStr}" is a reserved word and cannot be used`,
        });
      }

      // Check if custom link already exists for another marketplace
      const existingMarketplace = await Marketplace.findOne({
        where: {
          customLink: customLinkStr,
          id: { [Op.ne]: marketplaceId },
        },
      });

      if (existingMarketplace) {
        return res.status(400).json({
          status: false,
          message: "This custom link is already taken. Please choose another one.",
        });
      }

      // Update with validated custom link
      const [updatedCount] = await Marketplace.update(
        { customLink: customLinkStr },
        {
          where: { id: marketplaceId, deletedAt: null },
          returning: true,
        }
      );

      if (updatedCount === 0) {
        return res.status(404).json({
          status: false,
          message: "Marketplace not found or could not be updated.",
        });
      }
    } else {
      // Remove custom link (set to null)
      const [updatedCount] = await Marketplace.update(
        { customLink: null },
        {
          where: { id: marketplaceId, deletedAt: null },
          returning: true,
        }
      );

      if (updatedCount === 0) {
        return res.status(404).json({
          status: false,
          message: "Marketplace not found or could not be updated.",
        });
      }
    }

    const updatedMarketplace = await Marketplace.findByPk(marketplaceId);

    return res.status(200).json({
      status: true,
      message: customLink ? "Custom link updated successfully" : "Custom link removed successfully",
      data: updatedMarketplace,
    });

  } catch (error) {
    console.error("Error updating marketplace custom link:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      ...(process.env.SEND_ERRORS === 'true' && { 
        error: error instanceof Error ? error.message : "Unknown error" 
      })
    });
  }
};

/**
 * Update showPolicyRules setting
 */
export const updateShowPolicyRules = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const { marketplaceId, showPolicyRules } = req.body;

    if (!marketplaceId) {
      return res.status(400).json({
        status: false,
        message: "marketplaceId is required",
      });
    }

    if (typeof showPolicyRules !== 'boolean') {
      return res.status(400).json({
        status: false,
        message: "showPolicyRules must be a boolean value",
      });
    }

    // Verify user owns this marketplace
    const user = req.user;
    if (user.marketplaceId !== marketplaceId) {
      return res.status(403).json({
        status: false,
        message: "You can only update your own marketplace.",
      });
    }

    // Update showPolicyRules
    const [updatedCount] = await Marketplace.update(
      { showPolicyRules },
      {
        where: { id: marketplaceId, deletedAt: null },
        returning: true,
      }
    );

    if (updatedCount === 0) {
      return res.status(404).json({
        status: false,
        message: "Marketplace not found or could not be updated.",
      });
    }

    const updatedMarketplace = await Marketplace.findByPk(marketplaceId);

    return res.status(200).json({
      status: true,
      message: showPolicyRules 
        ? "Privacy/Rules will now be shown on your booking page" 
        : "Privacy/Rules hidden from booking page",
      data: updatedMarketplace,
    });

  } catch (error) {
    console.error("Error updating showPolicyRules:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      ...(process.env.SEND_ERRORS === 'true' && { 
        error: error instanceof Error ? error.message : "Unknown error" 
      })
    });
  }
};

/**
 * Update waitlist settings for marketplace (provider settings)
 */
export const updateWaitlistSettings = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const { marketplaceId, waitlistEnabled, waitlistClaimWindowMinutes } = req.body;

    if (!marketplaceId) {
      return res.status(400).json({
        status: false,
        message: "marketplaceId is required",
      });
    }

    const user = req.user;
    if (user.marketplaceId !== marketplaceId) {
      return res.status(403).json({
        status: false,
        message: "You can only update your own marketplace.",
      });
    }

    const updateData: { waitlistEnabled?: boolean; waitlistClaimWindowMinutes?: number } = {};

    if (waitlistEnabled !== undefined) {
      if (typeof waitlistEnabled !== "boolean") {
        return res.status(400).json({
          status: false,
          message: "waitlistEnabled must be a boolean value",
        });
      }
      updateData.waitlistEnabled = waitlistEnabled;
    }

    if (waitlistClaimWindowMinutes !== undefined) {
      const claimWindow = Number(waitlistClaimWindowMinutes);
      if (!Number.isInteger(claimWindow) || claimWindow < 15 || claimWindow > 30) {
        return res.status(400).json({
          status: false,
          message: "waitlistClaimWindowMinutes must be an integer between 15 and 30",
        });
      }
      updateData.waitlistClaimWindowMinutes = claimWindow;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        status: false,
        message: "Provide waitlistEnabled and/or waitlistClaimWindowMinutes.",
      });
    }

    const [updatedCount] = await Marketplace.update(updateData, {
      where: { id: marketplaceId, deletedAt: null },
      returning: true,
    });

    if (updatedCount === 0) {
      return res.status(404).json({
        status: false,
        message: "Marketplace not found or could not be updated.",
      });
    }

    const updatedMarketplace = await Marketplace.findByPk(marketplaceId);

    return res.status(200).json({
      status: true,
      message: "Waitlist settings updated successfully",
      data: updatedMarketplace,
    });
  } catch (error) {
    console.error("Error updating waitlist settings:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      ...(process.env.SEND_ERRORS === 'true' && {
        error: error instanceof Error ? error.message : "Unknown error"
      })
    });
  }
};

/**
 * Update booking page customization (title, subtitle, header image)
 */
export const updateBookingPageCustomization = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const { marketplaceId, bookingPageTitle, bookingPageSubtitle, deleteHeaderImage, deleteHeaderPdf } = req.body;
    const files = req.files as { [fieldname: string]: any[] };

    if (!marketplaceId) {
      return res.status(400).json({
        status: false,
        message: "marketplaceId is required",
      });
    }

    // Verify user owns this marketplace
    const user = req.user;
    if (user.marketplaceId !== marketplaceId) {
      return res.status(403).json({
        status: false,
        message: "You can only update your own marketplace.",
      });
    }

    const updateData: any = {};

    // Update title if provided
    if (bookingPageTitle !== undefined) {
      updateData.bookingPageTitle = bookingPageTitle || null;
    }

    // Update subtitle if provided
    if (bookingPageSubtitle !== undefined) {
      updateData.bookingPageSubtitle = bookingPageSubtitle || null;
    }

    // Handle header image deletion
    if (deleteHeaderImage === 'true' || deleteHeaderImage === true) {
      updateData.bookingPageHeaderImage = null;
    }

    // Handle header PDF deletion
    if (deleteHeaderPdf === 'true' || deleteHeaderPdf === true) {
      updateData.bookingPageHeaderPdf = null;
    }

    // Handle header image upload
    if (files && files.headerImage && files.headerImage[0]) {
      const file = files.headerImage[0];
      const relativePath = `marketplace-web-header/${file.filename}`;
      const publicUrl = localFileStorage.getPublicUrl(relativePath);
      updateData.bookingPageHeaderImage = publicUrl;
      // Clear PDF if image is uploaded
      updateData.bookingPageHeaderPdf = null;
    }

    // Handle header PDF upload
    if (files && files.headerPdf && files.headerPdf[0]) {
      const file = files.headerPdf[0];
      const relativePath = `marketplace-web-header-pdf/${file.filename}`;
      const publicUrl = localFileStorage.getPublicUrl(relativePath);
      updateData.bookingPageHeaderPdf = publicUrl;
      // Clear image if PDF is uploaded
      updateData.bookingPageHeaderImage = null;
    }

    // Update marketplace
    const [updatedCount] = await Marketplace.update(
      updateData,
      {
        where: { id: marketplaceId, deletedAt: null },
        returning: true,
      }
    );

    if (updatedCount === 0) {
      return res.status(404).json({
        status: false,
        message: "Marketplace not found or could not be updated.",
      });
    }

    const updatedMarketplace = await Marketplace.findByPk(marketplaceId);

    return res.status(200).json({
      status: true,
      message: "Booking page customization updated successfully",
      data: updatedMarketplace,
    });

  } catch (error) {
    console.error("Error updating booking page customization:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      ...(process.env.SEND_ERRORS === 'true' && { 
        error: error instanceof Error ? error.message : "Unknown error" 
      })
    });
  }
};

/**
 * Get marketplace by ID
 */
export const getMarketplaceById = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        status: false,
        message: "Marketplace ID is required",
      });
    }

    const marketplace = await Marketplace.findByPk(id, {
      include: [
        {
          model: Service,
          as: 'services',
          where: { isActive: true },
          required: false,
          attributes: [
            'id', 'name', 'category', 'subcategory', 'categoryId', 'subcategoryId',
            'description', 'price', 'duration', 'marketplaceId', 'isActive',
            'requireDeposit', 'depositType', 'depositAmount', 'imageUrl',
            'createdAt', 'updatedAt', 'deletedAt'
          ],
          include: [{
            model: ServiceAddOn,
            as: 'addOns',
            where: { deletedAt: null },
            required: false,
            attributes: ['id', 'title', 'price', 'isActive']
          }]
        },
        {
          model: Schedule,
          as: 'schedule',
          required: false,
        },
        {
          model: Social,
          as: 'socials',
          required: false,
        },
        {
          model: User,
          as: 'provider',
          attributes: [
            'id',
            'role',
            'name',
            'email',
            'currentSubscriptionId',
            'status',
            'accountVerified',
            'professionalVerified',
            'businessVerified',
            'identityVerified',
            'identityDocumentUrl',
            'isTeamMember',
            'teamOwnerId',
          ],
          required: false,
        },
        {
          model: User,
          as: 'user',
          attributes: [
            'id',
            'role',
            'name',
            'email',
            'currentSubscriptionId',
            'status',
            'accountVerified',
            'professionalVerified',
            'businessVerified',
            'identityVerified',
            'identityDocumentUrl',
            'isTeamMember',
            'teamOwnerId',
          ],
          required: false,
        },
      ],
    });

    if (!marketplace) {
      return res.status(404).json({
        status: false,
        message: "Marketplace not found",
      });
    }

    // Discovery paywall: clients who've used their free booking with no
    // active subscription are locked out of viewing a provider's profile -
    // unless they're specifically referred to *this* provider, in which case
    // they keep free access to that one provider regardless of the general lock.
    if (req.userId) {
      const canDiscover = await SubscriptionService.canClientDiscoverProviders(req.userId);
      if (!canDiscover.canDiscover) {
        const providerId = marketplace.userId;
        const isReferredToThisProvider = providerId
          ? await ReferralService.isClientReferredToProvider(req.userId, providerId)
          : false;

        if (!isReferredToThisProvider) {
          return res.status(403).json({
            status: false,
            requiresSubscription: true,
            message: canDiscover.reason,
            data: {
              preview: {
                id: marketplace.id,
                businessName: marketplace.businessName,
                imagesList: marketplace.imagesList,
              },
            },
          });
        }
      }
    }

    const responseData = { ...marketplace.toJSON() } as any;
    // Owner is Marketplace.userId (`provider`). `user` is Users.marketplaceId and
    // can be missing or a team member. Prefer the owner for verification badges.
    const ownerUser = responseData.provider ?? responseData.user;
    responseData.user = ownerUser;
    
    // Check for active subscription if user exists
    if (responseData.user && responseData.user.currentSubscriptionId) {
      const activeSubscription = await Subscription.findOne({
        where: {
          id: responseData.user.currentSubscriptionId,
          status: { [Op.in]: ['active', 'trialing'] }
        }
      });
      responseData.user.hasActiveSubscription = !!activeSubscription;
    } else if (responseData.user) {
      responseData.user.hasActiveSubscription = false;
    }
    
    // Process images
    if (responseData.imagesList && Array.isArray(responseData.imagesList)) {
      responseData.imagesList = responseData.imagesList.map((imagePath: string) => {
        if (imagePath.startsWith('http')) {
          return imagePath;
        }
        return `${req.protocol}://${req.get('host')}/uploads/${imagePath}`;
      });
    }

    if (responseData.portfolioImages && Array.isArray(responseData.portfolioImages)) {
      responseData.portfolioImages = responseData.portfolioImages.map((imagePath: string) => {
        if (imagePath.startsWith('http')) {
          return imagePath;
        }
        return `${req.protocol}://${req.get('host')}/uploads/${imagePath}`;
      });
    }

    return res.status(200).json({
      status: true,
      message: "Marketplace retrieved successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("Error getting marketplace by ID:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
