import { Response } from "express";
import { Service } from "../models/service_model";
import { ServiceAddOn } from "../models/service_addon_model";
import { Marketplace } from "../models/marketplace_model";
import { User } from "../models/user_model";
import { AuthRequest } from "../middlewares/auth.middleware";
import { localFileStorage } from "../utils/local-storage";
import { ALLOWED_MIMETYPES, MAX_FILE_SIZE } from "../utils/multer-config";

type UpdateServiceData = Partial<{
  name: string;
  category: string;
  description: string;
  price: number;
  duration: string;
  requireDeposit: boolean;
  depositType: 'fixed' | 'percentage';
  depositAmount: number;
  providerTeamMemberIds: string[];
  addOns: Array<{
    id?: string;
    title: string;
    price: number;
  }>;
}>;

function parseProviderTeamMemberIds(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (Array.isArray(raw)) {
    return raw.map((id) => String(id)).filter((id) => id.length > 0);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((id) => String(id)).filter((id) => id.length > 0);
      }
    } catch {
      return [trimmed];
    }
  }
  return undefined;
}

async function filterValidProviderIds(
  ownerId: string,
  ids: string[]
): Promise<string[]> {
  if (!ids.length) return [];
  const members = await User.findAll({
    where: {
      id: ids,
      teamOwnerId: ownerId,
      isTeamMember: true,
    },
    attributes: ["id"],
  });
  return members.map((m) => m.id);
}

function isAssignedServiceProvider(service: Service, userId: string): boolean {
  const ids = service.providerTeamMemberIds || [];
  return ids.map(String).includes(String(userId));
}

export const updateService = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const {
      serviceId,
      name,
      category,
      description,
      price,
      duration,
      requireDeposit,
      depositType,
      depositAmount,
      addOns,
      deletedAddOnIds,
    } = req.body;
    const file = req.file;

    if (!serviceId) {
      return res.status(400).json({
        status: false,
        message: "Please pass a valid service id",
      });
    }

    // Verify service exists and user owns the marketplace
    const service = await Service.findByPk(serviceId);
    if (!service) {
      return res.status(404).json({
        status: false,
        message: "Service not found.",
      });
    }

    // Verify user owns the marketplace that this service belongs to,
    // or is a team member assigned as a provider for this service.
    const user = req.user;
    const sharesMarketplace = user.marketplaceId === service.marketplaceId;
    const assignedProvider =
      user.isTeamMember === true && isAssignedServiceProvider(service, user.id);
    if (!sharesMarketplace && !assignedProvider) {
      return res.status(403).json({
        status: false,
        message: "You can only update services for your own marketplace.",
      });
    }

    // Handle service image upload
    let imageUrl: string | undefined;
    if (file) {
      // Validate file type
      if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
        return res.status(400).json({
          status: false,
          message: `Invalid file type. Only ${ALLOWED_MIMETYPES.join(", ")} are allowed.`,
        });
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        return res.status(400).json({
          status: false,
          message: `File too large (max ${MAX_FILE_SIZE / (1024 * 1024)}MB).`,
        });
      }

      // Delete old image if exists
      if (service.imageUrl) {
        try {
          const oldImagePath = service.imageUrl.replace(localFileStorage.getPublicUrl(''), '');
          await localFileStorage.deleteFile(oldImagePath);
          console.log(`Deleted old service image: ${oldImagePath}`);
        } catch (error) {
          console.error('Error deleting old service image:', error);
          // Continue with upload even if deletion fails
        }
      }

      // Save with full URL path in marketplace-service-images folder
      const relativePath = `marketplace-service-images/${file.filename}`;
      imageUrl = localFileStorage.getPublicUrl(relativePath);
    }

    const updateData: UpdateServiceData = {};
    if (name !== undefined) updateData.name = name;
    if (category !== undefined) updateData.category = category;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = Number(price);
    if (duration !== undefined) updateData.duration = duration;
    if (requireDeposit !== undefined) updateData.requireDeposit = requireDeposit;
    if (depositType !== undefined) updateData.depositType = depositType;
    if (depositAmount !== undefined) updateData.depositAmount = Number(depositAmount);
    if (imageUrl !== undefined) (updateData as any).imageUrl = imageUrl;

    // Only suite owners (not team members) can change service provider assignments.
    const parsedProviderIds = parseProviderTeamMemberIds(
      req.body.providerTeamMemberIds
    );
    if (parsedProviderIds !== undefined && user.isTeamMember !== true) {
      updateData.providerTeamMemberIds = await filterValidProviderIds(
        user.id,
        parsedProviderIds
      );
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(200).json({
        status: false,
        message:
          "No valid fields to update. Provide at least one of: name, category, description, price, duration.",
      });
    }

    const [updatedCount] = await Service.update(updateData, {
      where: { id: serviceId, deletedAt: null },
      returning: true,
    });

    if (updatedCount === 0) {
      return res.status(200).json({
        status: false,
        message: "No record found for this service Id or record is deleted.",
      });
    }

    // Handle add-ons update if provided OR if there are deletions to process
    const hasAddOns = addOns && Array.isArray(addOns);
    const hasDeletions = deletedAddOnIds && Array.isArray(deletedAddOnIds) && deletedAddOnIds.length > 0;
    
    if (hasAddOns || hasDeletions) {
      
      // Get existing add-ons
      const existingAddOns = await ServiceAddOn.findAll({
        where: { serviceId },
        order: [['createdAt', 'ASC']]
      });

      // Clean up any duplicate add-ons (same title and price) - keep the oldest one
      const duplicateGroups = new Map();
      for (const addon of existingAddOns) {
        const key = `${addon.title}-${addon.price}`;
        if (!duplicateGroups.has(key)) {
          duplicateGroups.set(key, []);
        }
        duplicateGroups.get(key).push(addon);
      }

      // Delete duplicates (keep first one, delete the rest)
      for (const [key, addons] of duplicateGroups) {
        if (addons.length > 1) {
          for (let i = 1; i < addons.length; i++) {
            await addons[i].destroy({ force: true });
          }
        }
      }

      // Refresh existing add-ons list after cleanup
      const cleanExistingAddOns = await ServiceAddOn.findAll({
        where: { serviceId }
      });

      // Handle explicit deletions first
      if (deletedAddOnIds && Array.isArray(deletedAddOnIds) && deletedAddOnIds.length > 0) {
        for (const deleteId of deletedAddOnIds) {
          const addonToDelete = cleanExistingAddOns.find(addon => {
            return addon.id === deleteId || addon.id.toString() === deleteId.toString();
          });
          if (addonToDelete) {
            await addonToDelete.destroy({ force: true });
          }
        }
        
        // Refresh the list after explicit deletions
        const afterExplicitDeletions = await ServiceAddOn.findAll({
          where: { serviceId }
        });
      }

      // Get IDs of add-ons that should remain (existing ones being updated)
      const keepAddOnIds = addOns ? addOns.filter((addon: any) => addon.id).map((addon: any) => addon.id) : [];
      
      // Get current add-ons after all deletions
      const currentAddOns = await ServiceAddOn.findAll({
        where: { serviceId }
      });
      
      // Hard delete any remaining add-ons that are not in the new list (and not already explicitly deleted)
      const addOnsToDelete = currentAddOns.filter((addon: any) => !keepAddOnIds.includes(addon.id));
      
      for (const addon of addOnsToDelete) {
        await (addon as any).destroy({ force: true });
      }

      // Process each add-on: update existing or create new (only if addOns provided)
      if (addOns && Array.isArray(addOns)) {
        for (const addonData of addOns) {
          // Validate add-on data
          if (!addonData.title || !addonData.title.trim()) {
            continue;
          }
          
          const price = parseFloat(addonData.price?.toString() || '0');
          if (price <= 0) {
            continue;
          }

          if (addonData.id) {
            // Update existing add-on
            await ServiceAddOn.update(
              { 
                title: addonData.title.trim(), 
                price: price,
                isActive: true 
              },
              { where: { id: addonData.id, serviceId } }
            );
          } else {
            // Create new add-on
            await ServiceAddOn.create({
              serviceId,
              title: addonData.title.trim(),
              price: price,
              isActive: true
            });
          }
        }
      }
    }

    const updatedService = await Service.findByPk(serviceId, {
      attributes: [
        'id', 'name', 'category', 'subcategory', 'categoryId', 'subcategoryId',
        'description', 'price', 'duration', 'marketplaceId', 'isActive',
        'requireDeposit', 'depositType', 'depositAmount', 'imageUrl',
        'providerTeamMemberIds',
        'createdAt', 'updatedAt', 'deletedAt'
      ],
      include: [{
        model: ServiceAddOn,
        as: 'addOns',
        where: { deletedAt: null },
        required: false,
        attributes: ['id', 'title', 'price', 'isActive']
      }]
    });

    return res.status(200).json({
      status: true,
      message: "Service updated successfully",
      data: updatedService,
    });
  } catch (error) {
    console.error("Error updating service data:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

// * ======================= ADD SERVICE =====================

export const createService = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    console.log('=== CREATE SERVICE REQUEST ===');
    console.log('Full request body:', JSON.stringify(req.body, null, 2));
    
    const { marketplaceId, name, category, subcategory, categoryId, subcategoryId, description, duration, requireDeposit, depositType, addOns } =
      req.body;
    const file = req.file;

    // Parse numeric values from strings
    const price = typeof req.body.price === 'string' ? parseFloat(req.body.price) : req.body.price;
    const depositAmount = req.body.depositAmount ? 
      (typeof req.body.depositAmount === 'string' ? parseFloat(req.body.depositAmount) : req.body.depositAmount) : 
      undefined;

    // Step 1: Validate all required fields
    if (
      !marketplaceId ||
      !name ||
      !category ||
      !description ||
      !price ||
      isNaN(price) ||
      !duration
    ) {
      return res.status(400).json({
        status: false,
        message:
          "Missing required fields. Provide: marketplaceId, name, category, description, price (number), duration.",
      });
    }

    // Step 2: Verify marketplace exists and user owns it
    const marketplace = await Marketplace.findByPk(marketplaceId);
    if (!marketplace) {
      return res.status(404).json({
        status: false,
        message: "Marketplace not found.",
      });
    }

    // Step 3: Verify user owns this marketplace
    const user = req.user;
    if (user.marketplaceId !== marketplaceId) {
      return res.status(403).json({
        status: false,
        message: "You can only create services for your own marketplace.",
      });
    }

    // Step 4: Additional validation
    if (price <= 0) {
      return res.status(400).json({
        status: false,
        message: "price must be a valid positive number.",
      });
    }

    if (
      name.trim().length === 0 ||
      category.trim().length === 0 ||
      description.trim().length === 0 ||
      duration.trim().length === 0
    ) {
      return res.status(200).json({
        status: false,
        message: "name, category, description, and duration must not be empty.",
      });
    }

    // Validate deposit fields if requireDeposit is true
    if (requireDeposit) {
      if (!depositType || !['fixed', 'percentage'].includes(depositType)) {
        return res.status(400).json({
          status: false,
          message: "depositType must be either 'fixed' or 'percentage' when requireDeposit is true.",
        });
      }
      
      if (!depositAmount || isNaN(depositAmount) || depositAmount <= 0) {
        return res.status(400).json({
          status: false,
          message: "depositAmount must be a valid positive number when requireDeposit is true.",
        });
      }
      
      if (depositType === 'percentage' && depositAmount > 100) {
        return res.status(400).json({
          status: false,
          message: "depositAmount cannot exceed 100 when depositType is 'percentage'.",
        });
      }
    }

    // Handle service image upload
    let imageUrl: string | undefined;
    if (file) {
      // Validate file type
      if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
        return res.status(400).json({
          status: false,
          message: `Invalid file type. Only ${ALLOWED_MIMETYPES.join(", ")} are allowed.`,
        });
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        return res.status(400).json({
          status: false,
          message: `File too large (max ${MAX_FILE_SIZE / (1024 * 1024)}MB).`,
        });
      }

      // Save with full URL path in marketplace-service-images folder
      const relativePath = `marketplace-service-images/${file.filename}`;
      imageUrl = localFileStorage.getPublicUrl(relativePath);
    }

    // Step 3: Create the service
    const parsedProviderIds = parseProviderTeamMemberIds(
      req.body.providerTeamMemberIds
    );
    const providerTeamMemberIds =
      user.isTeamMember !== true && parsedProviderIds !== undefined
        ? await filterValidProviderIds(user.id, parsedProviderIds)
        : [];

    const newService = await Service.create({
      marketplaceId,
      name: name.trim(),
      category: category.trim(),
      subcategory: subcategory || null,
      categoryId: categoryId || null,
      subcategoryId: subcategoryId || null,
      description: description.trim(),
      price,
      duration: duration.trim(),
      isActive: true,
      requireDeposit: requireDeposit || false,
      depositType: requireDeposit ? depositType : undefined,
      depositAmount: requireDeposit ? depositAmount : undefined,
      imageUrl: imageUrl,
      providerTeamMemberIds,
    });

    // Step 4: Create add-ons if provided
    console.log('Add-ons received:', addOns);
    console.log('Add-ons type:', typeof addOns);
    console.log('Add-ons is array:', Array.isArray(addOns));
    
    if (addOns && Array.isArray(addOns) && addOns.length > 0) {
      console.log('Processing add-ons, count:', addOns.length);
      for (const addonData of addOns) {
        console.log('Processing add-on:', addonData);
        console.log('Add-on title type:', typeof addonData.title);
        console.log('Add-on price type:', typeof addonData.price);
        
        if (addonData.title && (typeof addonData.price === 'number' || typeof addonData.price === 'string') && parseFloat(addonData.price) > 0) {
          const createdAddOn = await ServiceAddOn.create({
            serviceId: newService.id,
            title: addonData.title.trim(),
            price: parseFloat(addonData.price),
            isActive: true
          });
          console.log('Created add-on:', createdAddOn.toJSON());
        } else {
          console.log('Invalid add-on data:', addonData);
          console.log('Title check:', !!addonData.title);
          console.log('Price check:', typeof addonData.price, parseFloat(addonData.price));
        }
      }
    } else {
      console.log('No add-ons to process or invalid format');
      console.log('addOns exists:', !!addOns);
      console.log('addOns length:', addOns?.length);
    }

    // Step 5: Fetch the created service (with any includes if needed)
    const createdService = await Service.findByPk(newService.id, {
      attributes: [
        'id', 'name', 'category', 'subcategory', 'categoryId', 'subcategoryId',
        'description', 'price', 'duration', 'marketplaceId', 'isActive',
        'requireDeposit', 'depositType', 'depositAmount', 'imageUrl',
        'providerTeamMemberIds',
        'createdAt', 'updatedAt', 'deletedAt'
      ],
      include: [{
        model: ServiceAddOn,
        as: 'addOns',
        where: { deletedAt: null },
        required: false,
        attributes: ['id', 'title', 'price', 'isActive']
      }]
    });

    return res.status(201).json({
      status: true,
      message: "Service created successfully",
      data: createdService,
    });
  } catch (error) {
    console.error("Error creating service:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// * ======================= GET SERVICES =====================

export const getServices = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const { marketplaceId } = req.query;

    if (!marketplaceId) {
      return res.status(400).json({
        status: false,
        message: "marketplaceId is required as query parameter",
      });
    }

    // Verify marketplace exists
    const marketplace = await Marketplace.findByPk(marketplaceId);
    if (!marketplace) {
      return res.status(404).json({
        status: false,
        message: "Marketplace not found.",
      });
    }

    // Get all active services for the marketplace
    const services = await Service.findAll({
      where: { 
        marketplaceId: marketplaceId,
        isActive: true 
      },
      attributes: [
        'id', 'name', 'category', 'subcategory', 'categoryId', 'subcategoryId',
        'description', 'price', 'duration', 'marketplaceId', 'isActive',
        'requireDeposit', 'depositType', 'depositAmount', 'imageUrl',
        'providerTeamMemberIds',
        'createdAt', 'updatedAt', 'deletedAt'
      ],
      include: [{
        model: ServiceAddOn,
        as: 'addOns',
        where: { deletedAt: null },
        required: false,
        attributes: ['id', 'title', 'price', 'isActive']
      }],
      order: [['createdAt', 'DESC']]
    });

    return res.status(200).json({
      status: true,
      message: `Found ${services.length} services for marketplace`,
      data: services,
    });

  } catch (error) {
    console.error("Error getting services:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// * ======================= DELETE SERVICE =====================

export const deleteService = async (
  req: any,
  res: Response
): Promise<Response> => {
  try {
    const { serviceId } = req.query;

    if (!serviceId) {
      return res.status(400).json({
        status: false,
        message: "Please provide a valid service ID",
      });
    }

    // Verify service exists and user owns the marketplace
    const service = await Service.findByPk(serviceId);
    if (!service) {
      return res.status(404).json({
        status: false,
        message: "Service not found.",
      });
    }

    // Verify user owns the marketplace that this service belongs to
    const user = req.user;
    if (user.marketplaceId !== service.marketplaceId) {
      return res.status(403).json({
        status: false,
        message: "You can only delete services from your own marketplace.",
      });
    }

    // Soft delete the service by setting deletedAt timestamp
    const [updatedCount] = await Service.update(
      { deletedAt: new Date() },
      {
        where: { id: serviceId, deletedAt: null },
        returning: true,
      }
    );

    if (updatedCount === 0) {
      return res.status(404).json({
        status: false,
        message: "Service not found or already deleted.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Service deleted successfully",
      data: { serviceId },
    });
  } catch (error) {
    console.error("Error deleting service:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get single service by ID with add-ons
export const getServiceById = async (req: AuthRequest, res: Response): Promise<any> => {
  try {
    const { serviceId } = req.params;

    if (!serviceId) {
      return res.status(400).json({
        status: false,
        message: "Service ID is required",
      });
    }

    // Get service with add-ons
    const service = await Service.findByPk(serviceId, {
      include: [{
        model: ServiceAddOn,
        as: 'addOns',
        where: { deletedAt: null },
        required: false,
        attributes: ['id', 'title', 'price', 'isActive']
      }],
      attributes: [
        'id', 'name', 'category', 'subcategory', 'categoryId', 'subcategoryId',
        'description', 'price', 'duration', 'marketplaceId', 'isActive',
        'requireDeposit', 'depositType', 'depositAmount', 'imageUrl',
        'providerTeamMemberIds',
        'createdAt', 'updatedAt', 'deletedAt'
      ]
    });

    if (!service) {
      return res.status(404).json({
        status: false,
        message: "Service not found",
      });
    }

    console.log(`Fetched service ${serviceId} with ${service.addOns?.length || 0} add-ons`);

    return res.status(200).json({
      status: true,
      message: "Service fetched successfully",
      data: service,
    });
  } catch (error) {
    console.error("Error fetching service:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};
