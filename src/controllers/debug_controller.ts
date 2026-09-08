import { Request, Response } from "express";
import { User } from "../models/user_model";
import { Marketplace } from "../models/marketplace_model";
import { Service } from "../models/service_model";
import { Schedule } from "../models/schedule_model";
import { Social } from "../models/social_model";
import { Appointment } from "../models/appointment_model";
import { Review } from "../models/review_model";


// Map of available tables/models
const MODEL_MAP: Record<string, any> = {
  users: User,
  marketplaces: Marketplace,
  services: Service,
  schedules: Schedule,
  socials: Social,
  appointments: Appointment,
  reviews: Review,
};

/**
 * 🛠️ DEBUG CONTROLLER - Development & Testing Only
 * 
 * SECURITY WARNING: This controller should NEVER be deployed to production!
 * It allows direct database manipulation and bypasses all business logic.
 * 
 * Available endpoints:
 * - PUT /debug/update-field - Update any field in any table
 * - GET /debug/get-record - Get record from any table
 * - GET /debug/tables - List all available tables
 * - PUT /debug/user-status - Quick user status update
 * - PUT /debug/verify-user - Quick user verification (accountVerified + status)
 */

/**
 * Update any field in any table - Flexible debug endpoint
 * 
 * @route PUT /debug/update-field
 * @body {
 *   tableName: string,    // e.g., "users", "marketplaces"
 *   fieldName: string,    // e.g., "status", "accountVerified"
 *   fieldValue: any,      // e.g., "verified", true, 123
 *   whereField: string,   // e.g., "id", "email"
 *   whereValue: any       // e.g., "user-id-123", "user@example.com"
 * }
 */
export const updateTableField = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { tableName, fieldName, fieldValue, whereField, whereValue } = req.body;

    // Validate required fields
    if (!tableName || !fieldName || fieldValue === undefined || !whereField || whereValue === undefined) {
      return res.status(400).json({
        status: false,
        message: "Missing required fields: tableName, fieldName, fieldValue, whereField, whereValue",
        example: {
          tableName: "users",
          fieldName: "status", 
          fieldValue: "verified",
          whereField: "id",
          whereValue: "user-id-123"
        }
      });
    }

    // Get the model
    const Model = MODEL_MAP[tableName.toLowerCase()];
    if (!Model) {
      return res.status(400).json({
        status: false,
        message: `Table '${tableName}' not found`,
        availableTables: Object.keys(MODEL_MAP)
      });
    }

    // Find the record
    const record = await Model.findOne({
      where: { [whereField]: whereValue }
    });

    if (!record) {
      return res.status(404).json({
        status: false,
        message: `Record not found in ${tableName} where ${whereField} = ${whereValue}`
      });
    }

    // Store old value for logging
    const oldValue = record[fieldName];

    // Update the field
    await record.update({ [fieldName]: fieldValue });

    return res.status(200).json({
      status: true,
      message: `Successfully updated ${tableName}.${fieldName}`,
      data: {
        table: tableName,
        field: fieldName,
        whereCondition: `${whereField} = ${whereValue}`,
        oldValue: oldValue,
        newValue: fieldValue,
        recordId: record.id
      }
    });

  } catch (error) {
    console.error("Debug update field error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

/**
 * Get record details from any table
 * 
 * @route GET /debug/get-record
 * @query {
 *   tableName: string,    // e.g., "users"
 *   whereField: string,   // e.g., "id", "email"
 *   whereValue: any       // e.g., "user-id-123"
 * }
 */
export const getTableRecord = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { tableName, whereField, whereValue } = req.query;

    // Validate required fields
    if (!tableName || !whereField || whereValue === undefined) {
      return res.status(400).json({
        status: false,
        message: "Missing required query params: tableName, whereField, whereValue",
        example: "?tableName=users&whereField=id&whereValue=user-id-123"
      });
    }

    // Get the model
    const Model = MODEL_MAP[tableName.toString().toLowerCase()];
    if (!Model) {
      return res.status(400).json({
        status: false,
        message: `Table '${tableName}' not found`,
        availableTables: Object.keys(MODEL_MAP)
      });
    }

    // Find the record
    const record = await Model.findOne({
      where: { [whereField.toString()]: whereValue }
    });

    if (!record) {
      return res.status(404).json({
        status: false,
        message: `Record not found in ${tableName} where ${whereField} = ${whereValue}`
      });
    }

    return res.status(200).json({
      status: true,
      message: `Record found in ${tableName}`,
      data: record
    });

  } catch (error) {
    console.error("Debug get record error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

/**
 * List all available tables and their fields
 * 
 * @route GET /debug/tables
 */
export const listAvailableTables = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const tableInfo: Record<string, string[]> = {};

    // Get model attributes for each table
    Object.entries(MODEL_MAP).forEach(([tableName, Model]) => {
      // Get the raw attributes from the model
      const attributes = Object.keys(Model.rawAttributes || {});
      tableInfo[tableName] = attributes;
    });

    return res.status(200).json({
      status: true,
      message: "Available tables and fields",
      data: {
        tables: tableInfo,
        usage: {
          updateField: "PUT /debug/update-field",
          getRecord: "GET /debug/get-record?tableName=users&whereField=id&whereValue=123",
          listTables: "GET /debug/tables"
        }
      }
    });

  } catch (error) {
    console.error("Debug list tables error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

/**
 * Quick user status update - Common debug operation
 * 
 * @route PUT /debug/user-status
 * @body {
 *   userId?: string,      // User ID
 *   email?: string,       // Or user email
 *   status: string        // "pending", "verified", "rejected"
 * }
 */
export const updateUserStatus = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { userId, email, status } = req.body;

    if (!status) {
      return res.status(400).json({
        status: false,
        message: "Status is required",
        validStatuses: ["pending", "verified", "rejected"]
      });
    }

    if (!userId && !email) {
      return res.status(400).json({
        status: false,
        message: "Either userId or email is required"
      });
    }

    // Build where condition
    const whereCondition: any = {};
    if (userId) whereCondition.id = userId;
    if (email) whereCondition.email = email;

    // Find and update user
    const user = await User.findOne({ where: whereCondition });
    
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found"
      });
    }

    const oldStatus = user.status;
    await user.update({ status });

    return res.status(200).json({
      status: true,
      message: `User status updated from '${oldStatus}' to '${status}'`,
      data: {
        userId: user.id,
        email: user.email,
        name: user.name,
        oldStatus,
        newStatus: status
      }
    });

  } catch (error) {
    console.error("Debug update user status error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

/**
 * Quick user verification - Sets both accountVerified and status
 * 
 * @route PUT /debug/verify-user
 * @body {
 *   userId?: string,      // User ID
 *   email?: string,       // Or user email
 * }
 */
export const verifyUser = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { userId, email } = req.body;

    if (!userId && !email) {
      return res.status(400).json({
        status: false,
        message: "Either userId or email is required"
      });
    }

    // Build where condition
    const whereCondition: any = {};
    if (userId) whereCondition.id = userId;
    if (email) whereCondition.email = email;

    // Find and update user
    const user = await User.findOne({ where: whereCondition });
    
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found"
      });
    }

    const oldAccountVerified = user.accountVerified;
    const oldStatus = user.status;

    // Update both accountVerified and status
    await user.update({ 
      accountVerified: true,
      status: "verified"
    });

    return res.status(200).json({
      status: true,
      message: `User fully verified - accountVerified: ${oldAccountVerified} → true, status: '${oldStatus}' → 'verified'`,
      data: {
        userId: user.id,
        email: user.email,
        name: user.name,
        changes: {
          accountVerified: {
            old: oldAccountVerified,
            new: true
          },
          status: {
            old: oldStatus,
            new: "verified"
          }
        }
      }
    });

  } catch (error) {
    console.error("Debug verify user error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

/**
 * Add test users - Creates client, solo, and suite test users
 * 
 * @route POST /debug/add-test-users
 */
export const addTestUsers = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const bcrypt = require('bcryptjs');
    
    // Test users data from Postman environment
    const testUsers = [
      {
        email: 'client@booqly.com',
        password: 'TestPass123!',
        name: 'Test Client',
        role: 'client' as const,
        accountVerified: true,
        status: 'verified' as const
      },
      {
        email: 'provider@booqly.com', 
        password: 'TestPass123!',
        name: 'Test Solo Provider',
        role: 'solo' as const,
        accountVerified: true,
        status: 'verified' as const
      },
      {
        email: 'provider2@booqly.com', 
        password: 'TestPass123!',
        name: 'Test Solo Provider2',
        role: 'solo' as const,
        accountVerified: true,
        status: 'verified' as const
      },
      {
        email: 'suite@booqly.com',
        password: 'TestPass123!', 
        name: 'Test Suite Provider',
        role: 'suite' as const,
        accountVerified: true,
        status: 'verified' as const
      },
      {
        email: 'iamclient@booqly.com',
        password: 'TestPass123!',
        name: 'I Am Client',
        role: 'client' as const,
        accountVerified: true,
        status: 'verified' as const
      },
      {
        email: 'iamsolo@booqly.com',
        password: 'TestPass123!',
        name: 'I Am Solo Provider',
        role: 'solo' as const,
        accountVerified: true,
        status: 'verified' as const
      },
      {
        email: 'provider3@booqly.com',
        password: 'TestPass123!',
        name: 'Test Solo Provider3',
        role: 'solo' as const,
        accountVerified: true,
        status: 'verified' as const
      },
      {
        email: 'provider4@booqly.com',
        password: 'TestPass123!',
        name: 'Test Solo Provider4',
        role: 'solo' as const,
        accountVerified: true,
        status: 'verified' as const
      }
    ];

    const createdUsers = [];
    const existingUsers = [];

    for (const userData of testUsers) {
      // Check if user already exists
      const existingUser = await User.findOne({ 
        where: { email: userData.email } 
      });

      if (existingUser) {
        existingUsers.push({
          email: userData.email,
          role: userData.role,
          status: 'already exists'
        });
        continue;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      // Create user
      const newUser = await User.create({
        email: userData.email,
        password: hashedPassword,
        name: userData.name,
        role: userData.role,
        accountVerified: userData.accountVerified,
        status: userData.status,
        freeBookingUsed: false
      });

      createdUsers.push({
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        accountVerified: newUser.accountVerified,
        status: newUser.status
      });
    }

    return res.status(200).json({
      status: true,
      message: `Test users processing complete. Created: ${createdUsers.length}, Existing: ${existingUsers.length}`,
      data: {
        created: createdUsers,
        existing: existingUsers,
        summary: {
          totalProcessed: testUsers.length,
          newlyCreated: createdUsers.length,
          alreadyExisting: existingUsers.length
        }
      }
    });

  } catch (error) {
    console.error('Debug add test users error:', error);
    return res.status(500).json({
      status: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * 🏪 Add Test Marketplaces for Test Providers
 * Creates marketplaces for provider@booqly.com and provider2@booqly.com test users
 */
export const addTestMarketplaces = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const baseUrl = process.env.BASE_URL || 'http://192.168.1.5:3000';
    
    // Find the test provider users
    const provider1User = await User.findOne({ where: { email: 'provider@booqly.com' } });
    const provider2User = await User.findOne({ where: { email: 'provider2@booqly.com' } });
    const provider3User = await User.findOne({ where: { email: 'provider3@booqly.com' } });
    const provider4User = await User.findOne({ where: { email: 'provider4@booqly.com' } });
    
    if (!provider1User) {
      return res.status(400).json({
        status: false,
        message: 'Provider test user (provider@booqly.com) not found. Please run addTestUsers first.'
      });
    }
    
    if (!provider2User) {
      return res.status(400).json({
        status: false,
        message: 'Provider2 test user (provider2@booqly.com) not found. Please run addTestUsers first.'
      });
    }

    if (!provider3User) {
      return res.status(400).json({
        status: false,
        message: 'Provider3 test user (provider3@booqly.com) not found. Please run addTestUsers first.'
      });
    }

    if (!provider4User) {
      return res.status(400).json({
        status: false,
        message: 'Provider4 test user (provider4@booqly.com) not found. Please run addTestUsers first.'
      });
    }

    const createdMarketplaces = [];
    const existingMarketplaces = [];

    // Test marketplace data
    const testMarketplaces = [
      {
        user: provider1User,
        businessName: 'Elite Hair Studio',
        phoneNumber: '+92-300-1234567',
        businessEmail: 'contact@elitehairstudio.com',
        address: '123 Fashion Street, F-7 Markaz, Islamabad, Pakistan',
        latitude: 33.7294,
        longitude: 73.0931,
        bio: 'Premium hair styling and beauty services in the heart of Islamabad. We specialize in modern cuts, coloring, and styling for all occasions.',
        policyRules: 'Please arrive 10 minutes early for your appointment. Cancellations must be made 24 hours in advance.',
        imagesList: [
          `${baseUrl}/uploads/marketplace-images/m1.jpg`,
          `${baseUrl}/uploads/marketplace-images/m2.jpg`,
          `${baseUrl}/uploads/marketplace-images/m3.jpg`
        ],
        portfolioImages: [
          `${baseUrl}/uploads/marketplace-portfolio/p1.jpg`,
          `${baseUrl}/uploads/marketplace-portfolio/p2.jpg`,
          `${baseUrl}/uploads/marketplace-portfolio/p3.jpg`
        ],
        schedule: {
          monday: '9:00 AM - 7:00 PM',
          tuesday: '9:00 AM - 7:00 PM',
          wednesday: '9:00 AM - 7:00 PM',
          thursday: '9:00 AM - 7:00 PM',
          friday: '9:00 AM - 7:00 PM',
          saturday: '10:00 AM - 6:00 PM',
          sunday: 'closed'
        },
        services: [
          {
            name: 'Haircut & Styling',
            category: 'Hair',
            subcategory: 'Cut & Style',
            description: 'Professional haircut with styling and blow-dry',
            price: '2500',
            duration: '60',
            requireDeposit: false,
            addOns: [
              {
                title: 'Hair Wash & Conditioning',
                price: 500
              },
              {
                title: 'Hot Towel Treatment',
                price: 300
              },
              {
                title: 'Scalp Massage',
                price: 400
              }
            ]
          },
          {
            name: 'Hair Coloring',
            category: 'Hair',
            subcategory: 'Coloring',
            description: 'Full hair coloring service with premium products',
            price: '4500',
            duration: '120',
            requireDeposit: true,
            depositType: 'percentage',
            depositAmount: '30',
            addOns: [
              {
                title: 'Deep Conditioning Treatment',
                price: 800
              },
              {
                title: 'Gloss Treatment',
                price: 1200
              },
              {
                title: 'Root Touch-up',
                price: 1500
              }
            ]
          },
          {
            name: 'Beard Trim',
            category: 'Barber',
            subcategory: 'Beard',
            description: 'Professional beard trimming and shaping',
            price: '800',
            duration: '30',
            requireDeposit: false,
            addOns: [
              {
                title: 'Beard Oil Application',
                price: 200
              },
              {
                title: 'Mustache Styling',
                price: 150
              }
            ]
          }
        ],
        socials: {
          insta: '@elitehairstudio',
          tiktok: '@elitehairstudio',
          facebook: 'Elite Hair Studio Islamabad'
        }
      },
      {
        user: provider2User,
        businessName: 'Bella Lash & Brow Studio',
        phoneNumber: '+92-300-7654321',
        businessEmail: 'info@bellalashbrow.com',
        address: '789 Beauty Lane, G-9 Markaz, Islamabad, Pakistan',
        latitude: 33.6973,
        longitude: 73.0515,
        bio: 'Specialized lash extensions, brow shaping, and waxing services. Expert in creating stunning lashes and perfectly shaped brows for every face.',
        policyRules: 'Patch test required 24 hours before first lash service. Please arrive with clean lashes and no makeup.',
        imagesList: [
          `${baseUrl}/uploads/marketplace-images/m3.jpg`,
          `${baseUrl}/uploads/marketplace-images/m1.jpg`,
          `${baseUrl}/uploads/marketplace-images/m2.jpg`
        ],
        portfolioImages: [
          `${baseUrl}/uploads/marketplace-portfolio/p3.jpg`,
          `${baseUrl}/uploads/marketplace-portfolio/p1.jpg`,
          `${baseUrl}/uploads/marketplace-portfolio/p2.jpg`
        ],
        schedule: {
          monday: '10:00 AM - 7:00 PM',
          tuesday: '10:00 AM - 7:00 PM',
          wednesday: 'closed',
          thursday: '10:00 AM - 7:00 PM',
          friday: '10:00 AM - 7:00 PM',
          saturday: '9:00 AM - 8:00 PM',
          sunday: '12:00 PM - 5:00 PM'
        },
        services: [
          {
            name: 'Classic Lash Extensions',
            category: 'Lashes',
            subcategory: 'Extensions',
            description: 'Natural-looking individual lash extensions for everyday wear',
            price: '4000',
            duration: '120',
            requireDeposit: true,
            depositType: 'percentage',
            depositAmount: '25',
            addOns: [
              {
                title: 'Lash Lift',
                price: 1000
              },
              {
                title: 'Lash Tint',
                price: 800
              },
              {
                title: 'Bottom Lash Extensions',
                price: 1500
              }
            ]
          },
          {
            name: 'Volume Lash Extensions',
            category: 'Lashes',
            subcategory: 'Extensions',
            description: 'Dramatic volume lashes with multiple extensions per natural lash',
            price: '6000',
            duration: '150',
            requireDeposit: true,
            depositType: 'fixed',
            depositAmount: '2000',
            addOns: [
              {
                title: 'Mega Volume Upgrade',
                price: 2000
              },
              {
                title: 'Colored Lashes',
                price: 1200
              },
              {
                title: 'Lash Sealant',
                price: 600
              }
            ]
          },
          {
            name: 'Eyebrow Lamination',
            category: 'Brows',
            subcategory: 'Lamination',
            description: 'Brow lamination with tinting for fuller, fluffier brows',
            price: '2500',
            duration: '75',
            requireDeposit: false,
            addOns: [
              {
                title: 'Brow Tinting',
                price: 700
              },
              {
                title: 'Brow Mapping',
                price: 500
              },
              {
                title: 'Henna Brows',
                price: 900
              }
            ]
          },
          {
            name: 'Brazilian Wax',
            category: 'Waxing',
            subcategory: 'Body',
            description: 'Complete Brazilian waxing service with premium wax',
            price: '3500',
            duration: '45',
            requireDeposit: false,
            addOns: [
              {
                title: 'Soothing Gel Application',
                price: 300
              },
              {
                title: 'Ingrown Hair Treatment',
                price: 500
              }
            ]
          },
          {
            name: 'Upper Lip Wax',
            category: 'Waxing',
            subcategory: 'Face',
            description: 'Quick and precise upper lip hair removal',
            price: '500',
            duration: '15',
            requireDeposit: false,
            addOns: [
              {
                title: 'Chin Wax',
                price: 400
              },
              {
                title: 'Eyebrow Wax',
                price: 600
              }
            ]
          }
        ],
        socials: {
          insta: '@bellalashbrow',
          tiktok: '@bellalashes',
          facebook: 'Bella Lash & Brow Studio'
        }
      },
      {
        user: provider3User,
        businessName: 'Glow Aesthetics Clinic',
        phoneNumber: '+92-300-9876543',
        businessEmail: 'info@glowaesthetics.com',
        address: '456 Beauty Avenue, F-7 Markaz, Islamabad, Pakistan',
        latitude: 33.7215,
        longitude: 73.0433,
        bio: 'Premium aesthetics and skincare treatments with advanced technology. Specializing in anti-aging, injectables, and medical-grade facials for radiant, youthful skin.',
        policyRules: 'Consultation required for all treatments. 48-hour cancellation policy. No refunds for completed services. Medical history disclosure mandatory.',
        imagesList: [
          `${baseUrl}/uploads/marketplace-images/m1.jpg`,
          `${baseUrl}/uploads/marketplace-images/m2.jpg`,
          `${baseUrl}/uploads/marketplace-images/m3.jpg`
        ],
        portfolioImages: [
          `${baseUrl}/uploads/marketplace-portfolio/p1.jpg`,
          `${baseUrl}/uploads/marketplace-portfolio/p2.jpg`,
          `${baseUrl}/uploads/marketplace-portfolio/p3.jpg`
        ],
        schedule: {
          monday: '9:00 AM - 6:00 PM',
          tuesday: '9:00 AM - 6:00 PM',
          wednesday: '9:00 AM - 6:00 PM',
          thursday: '9:00 AM - 6:00 PM',
          friday: '9:00 AM - 6:00 PM',
          saturday: '10:00 AM - 4:00 PM',
          sunday: 'Closed'
        },
        services: [
          {
            name: 'Anti-Wrinkle Injections',
            category: 'Aesthetics & Injectables',
            subcategory: 'Anti-Wrinkle / Neurotoxins',
            description: 'Botox and Dysport injections for wrinkle reduction and prevention',
            price: '8000',
            duration: '45',
            requireDeposit: true,
            depositType: 'fixed',
            depositAmount: '2000',
            addOns: [
              {
                title: 'Additional Areas',
                price: 2500
              },
              {
                title: 'Touch-up Session',
                price: 1500
              }
            ]
          },
          {
            name: 'Dermal Fillers',
            category: 'Aesthetics & Injectables',
            subcategory: 'Dermal Fillers',
            description: 'Hyaluronic acid fillers for lip enhancement and facial contouring',
            price: '12000',
            duration: '60',
            requireDeposit: true,
            depositType: 'percentage',
            depositAmount: '40',
            addOns: [
              {
                title: 'Numbing Cream',
                price: 500
              },
              {
                title: 'Aftercare Kit',
                price: 800
              }
            ]
          },
          {
            name: 'HydraFacial MD',
            category: 'Skincare',
            subcategory: 'Facials',
            description: 'Medical-grade hydradermabrasion with instant results',
            price: '6500',
            duration: '75',
            requireDeposit: false,
            addOns: [
              {
                title: 'LED Light Therapy',
                price: 1000
              },
              {
                title: 'Booster Serum',
                price: 1500
              }
            ]
          },
          {
            name: 'Chemical Peel',
            category: 'Skincare',
            subcategory: 'Chemical Peels',
            description: 'Professional chemical peels for skin renewal and texture improvement',
            price: '4500',
            duration: '45',
            requireDeposit: false,
            addOns: [
              {
                title: 'Post-Peel Healing Mask',
                price: 800
              },
              {
                title: 'SPF Protection Kit',
                price: 1200
              }
            ]
          }
        ],
        socials: {
          insta: '@glowaesthetics',
          tiktok: '@glowclinic',
          facebook: 'Glow Aesthetics Clinic'
        }
      },
      {
        user: provider4User,
        businessName: 'Urban Barber Lounge',
        phoneNumber: '+92-300-5555777',
        businessEmail: 'bookings@urbanbarber.com',
        address: '789 Style Street, Blue Area, Islamabad, Pakistan',
        latitude: 33.7077,
        longitude: 73.0563,
        bio: 'Modern barbershop offering premium grooming services for the contemporary gentleman. Expert cuts, traditional shaves, and luxury grooming experiences.',
        policyRules: '24-hour cancellation policy. Late arrivals may result in shortened service time. Cash and card payments accepted.',
        imagesList: [
          `${baseUrl}/uploads/marketplace-images/m2.jpg`,
          `${baseUrl}/uploads/marketplace-images/m1.jpg`,
          `${baseUrl}/uploads/marketplace-images/m3.jpg`
        ],
        portfolioImages: [
          `${baseUrl}/uploads/marketplace-portfolio/p2.jpg`,
          `${baseUrl}/uploads/marketplace-portfolio/p1.jpg`,
          `${baseUrl}/uploads/marketplace-portfolio/p3.jpg`
        ],
        schedule: {
          monday: '10:00 AM - 8:00 PM',
          tuesday: '10:00 AM - 8:00 PM',
          wednesday: '10:00 AM - 8:00 PM',
          thursday: '10:00 AM - 8:00 PM',
          friday: '10:00 AM - 8:00 PM',
          saturday: '9:00 AM - 7:00 PM',
          sunday: '11:00 AM - 5:00 PM'
        },
        services: [
          {
            name: 'Signature Haircut',
            category: 'Barber Services',
            subcategory: 'Fades & Shape-Ups',
            description: 'Premium haircut with consultation, wash, cut, style, and finish',
            price: '1500',
            duration: '45',
            requireDeposit: false,
            addOns: [
              {
                title: 'Hair Wash & Conditioning',
                price: 300
              },
              {
                title: 'Styling Products',
                price: 500
              },
              {
                title: 'Scalp Treatment',
                price: 700
              }
            ]
          },
          {
            name: 'Traditional Hot Towel Shave',
            category: 'Barber Services',
            subcategory: 'Hot Towel Shaves',
            description: 'Classic straight razor shave with hot towel treatment and aftercare',
            price: '2000',
            duration: '60',
            requireDeposit: false,
            addOns: [
              {
                title: 'Beard Oil Treatment',
                price: 400
              },
              {
                title: 'Face Moisturizing',
                price: 300
              }
            ]
          },
          {
            name: 'Beard Trim & Shape',
            category: 'Barber Services',
            subcategory: 'Beard Trims',
            description: 'Professional beard trimming, shaping, and styling',
            price: '800',
            duration: '30',
            requireDeposit: false,
            addOns: [
              {
                title: 'Mustache Styling',
                price: 200
              },
              {
                title: 'Beard Balm Application',
                price: 250
              }
            ]
          },
          {
            name: 'Gentleman\'s Package',
            category: 'Barber Services',
            subcategory: 'Fades & Shape-Ups',
            description: 'Complete grooming package: haircut, beard trim, and hot towel shave',
            price: '3500',
            duration: '90',
            requireDeposit: true,
            depositType: 'fixed',
            depositAmount: '1000',
            addOns: [
              {
                title: 'Eyebrow Trim',
                price: 300
              },
              {
                title: 'Nose Hair Trim',
                price: 200
              },
              {
                title: 'Premium Aftershave',
                price: 600
              }
            ]
          }
        ],
        socials: {
          insta: '@urbanbarberlounge',
          tiktok: '@urbanbarber',
          facebook: 'Urban Barber Lounge'
        }
      }
    ];

    // Process each marketplace
    for (const marketplaceData of testMarketplaces) {
      // Check if marketplace already exists for this user
      const existingMarketplace = await Marketplace.findOne({
        where: { userId: marketplaceData.user.id }
      });

      if (existingMarketplace) {
        existingMarketplaces.push({
          businessName: marketplaceData.businessName,
          userEmail: marketplaceData.user.email,
          status: 'already exists'
        });
        continue;
      }

      // Create schedule
      const newSchedule = await Schedule.create(marketplaceData.schedule);

      // Create marketplace
      const newMarketplace = await Marketplace.create({
        businessName: marketplaceData.businessName,
        phoneNumber: marketplaceData.phoneNumber,
        businessEmail: marketplaceData.businessEmail,
        address: marketplaceData.address,
        latitude: marketplaceData.latitude,
        longitude: marketplaceData.longitude,
        bio: marketplaceData.bio,
        policyRules: marketplaceData.policyRules,
        showPolicyRules: false,
        scheduleId: newSchedule.id,
        userId: marketplaceData.user.id,
        imagesList: marketplaceData.imagesList,
        portfolioImages: marketplaceData.portfolioImages
      });

      // Create services
      const newServices = await Service.bulkCreate(
        marketplaceData.services.map((serviceData: any) => ({
          ...serviceData,
          marketplaceId: newMarketplace.id,
          isActive: true
        }))
      );

      // Create socials
      await Social.create({
        ...marketplaceData.socials,
        marketplaceId: newMarketplace.id
      });

      // Update user with marketplace ID
      marketplaceData.user.marketplaceId = newMarketplace.id;
      await marketplaceData.user.save();

      createdMarketplaces.push({
        id: newMarketplace.id,
        businessName: newMarketplace.businessName,
        userEmail: marketplaceData.user.email,
        servicesCount: newServices.length,
        status: 'created'
      });
    }

    return res.status(200).json({
      status: true,
      message: `Test marketplaces processing complete. Created: ${createdMarketplaces.length}, Existing: ${existingMarketplaces.length}`,
      data: {
        created: createdMarketplaces,
        existing: existingMarketplaces,
        summary: {
          totalProcessed: testMarketplaces.length,
          newlyCreated: createdMarketplaces.length,
          alreadyExisting: existingMarketplaces.length
        }
      }
    });

  } catch (error) {
    console.error('Debug add test marketplaces error:', error);
    return res.status(500).json({
      status: false,
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
