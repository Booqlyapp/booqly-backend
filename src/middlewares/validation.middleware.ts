import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

/**
 * Generic validation middleware factory
 */
export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Show all validation errors
      stripUnknown: true, // Remove unknown fields
      allowUnknown: false // Don't allow unknown fields
    });
    
    if (error) {
      res.status(400).json({
        status: false,
        message: 'Validation error',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
        })),
      });
      return;
    }
    
    // Replace req.body with validated and sanitized data
    req.body = value;
    next();
  };
};

/**
 * Validation schemas
 */
export const schemas = {
  // User registration
  registerUser: Joi.object({
    name: Joi.string().trim().min(2).max(50).required()
      .messages({
        'string.empty': 'Name is required',
        'string.min': 'Name must be at least 2 characters long',
        'string.max': 'Name cannot exceed 50 characters'
      }),
    email: Joi.string().trim().email({ tlds: { allow: false } }).required()
      .messages({
        'string.empty': 'Email is required',
        'string.email': 'Please provide a valid email address'
      }),
    password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)')).required()
      .messages({
        'string.empty': 'Password is required',
        'string.min': 'Password must be at least 8 characters long',
        'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, and one number'
      }),
    phone: Joi.string().trim().pattern(/^\+?[\d\s\-\(\)]+$/).optional()
      .messages({
        'string.pattern.base': 'Please provide a valid phone number'
      }),
    role: Joi.string().valid('client', 'solo', 'suite').required()
      .messages({
        'string.empty': 'Role is required',
        'any.only': 'Role must be one of: client, solo, suite'
      }),
    businessName: Joi.string().trim().min(2).max(100).when('role', {
      is: Joi.valid('solo', 'suite'),
      then: Joi.required().messages({
        'string.empty': 'Business name is required for solo professionals and suite owners',
        'any.required': 'Business name is required for solo professionals and suite owners'
      }),
      otherwise: Joi.optional()
    }).messages({
      'string.min': 'Business name must be at least 2 characters long',
      'string.max': 'Business name cannot exceed 100 characters'
    }),
    referralCode: Joi.string().trim().optional(),
  }).options({ stripUnknown: true }),

  // Forgot password - step 1: request an OTP by email
  forgotPassword: Joi.object({
    email: Joi.string().trim().email({ tlds: { allow: false } }).required()
      .messages({
        'string.empty': 'Email is required',
        'string.email': 'Please provide a valid email address'
      }),
  }).options({ stripUnknown: true }),

  // Forgot password - step 2: verify OTP and set a new password
  resetPasswordWithOtp: Joi.object({
    email: Joi.string().trim().email({ tlds: { allow: false } }).required()
      .messages({
        'string.empty': 'Email is required',
        'string.email': 'Please provide a valid email address'
      }),
    otp: Joi.string().trim().length(6).pattern(/^\d{6}$/).required()
      .messages({
        'string.empty': 'Verification code is required',
        'string.length': 'Verification code must be 6 digits',
        'string.pattern.base': 'Verification code must be 6 digits'
      }),
    newPassword: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)')).required()
      .messages({
        'string.empty': 'New password is required',
        'string.min': 'Password must be at least 8 characters long',
        'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, and one number'
      }),
  }).options({ stripUnknown: true }),

  // User login
  loginUser: Joi.object({
    email: Joi.string().trim().email({ tlds: { allow: false } }).required()
      .messages({
        'string.empty': 'Email is required',
        'string.email': 'Please provide a valid email address'
      }),
    password: Joi.string().required()
      .messages({
        'string.empty': 'Password is required'
      }),
    role: Joi.string().valid('client', 'solo', 'suite', 'admin').required()
      .messages({
        'string.empty': 'Role is required',
        'any.only': 'Role must be one of: client, solo, suite, admin'
      }),
  }).options({ stripUnknown: true }),

  // Update user profile (authenticated user) - only safe fields
  updateUser: Joi.object({
    name: Joi.string().min(2).max(50).optional(),
    phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).optional(),
    businessName: Joi.string().min(2).max(100).optional().allow(null),
  }),

  // Update user FCM token
  updateUserFcmToken: Joi.object({
    fcmToken: Joi.string().max(4096).allow(null, '').required(),
  }),

  createTeamMember: Joi.object({
    name: Joi.string().trim().min(2).max(50).required(),
    email: Joi.string().trim().email({ tlds: { allow: false } }).required(),
    password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)')).required()
      .messages({
        'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, and one number'
      }),
    phone: Joi.string().trim().pattern(/^\+?[\d\s\-\(\)]+$/).optional().allow(null, ''),
    jobTitle: Joi.string().trim().max(100).optional().allow(null, ''),
    employmentStartDate: Joi.date().optional().allow(null),
    employmentEndDate: Joi.date().optional().allow(null),
  }).custom((value, helpers) => {
    if (value.employmentStartDate && value.employmentEndDate) {
      if (new Date(value.employmentEndDate) < new Date(value.employmentStartDate)) {
        return helpers.error('any.invalid');
      }
    }
    return value;
  }, 'Employment date validation').messages({
    'any.invalid': 'employmentEndDate must be greater than or equal to employmentStartDate',
  }),

  updateTeamMember: Joi.object({
    name: Joi.string().trim().min(2).max(50).optional(),
    email: Joi.string().trim().email({ tlds: { allow: false } }).optional(),
    phone: Joi.string().trim().pattern(/^\+?[\d\s\-\(\)]+$/).optional().allow(null, ''),
    jobTitle: Joi.string().trim().max(100).optional().allow(null, ''),
    employmentStartDate: Joi.date().optional().allow(null),
    employmentEndDate: Joi.date().optional().allow(null),
    password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)')).optional()
      .messages({
        'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, and one number'
      }),
  }).min(1).custom((value, helpers) => {
    if (value.employmentStartDate && value.employmentEndDate) {
      if (new Date(value.employmentEndDate) < new Date(value.employmentStartDate)) {
        return helpers.error('any.invalid');
      }
    }
    return value;
  }, 'Employment date validation').messages({
    'any.invalid': 'employmentEndDate must be greater than or equal to employmentStartDate',
  }),

  // Change user email (separate secure endpoint)
  changeUserEmail: Joi.object({
    newEmail: Joi.string().email().required(),
    currentPassword: Joi.string().required(),
  }),

  // Change user email and phone (separate secure endpoint) - user is already authenticated
  changeUserEmailAndPhone: Joi.object({
    newEmail: Joi.string().email().required(),
    newPhone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).allow('').optional(),
  }),

  // Change user password (separate secure endpoint) - user is already authenticated
  changeUserPassword: Joi.object({
    newPassword: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)')).required()
      .messages({
        'string.pattern.base': 'New password must contain at least one lowercase letter, one uppercase letter, and one number'
      }),
  }),

  // Delete user account (no body needed - uses authenticated user)
  deleteUser: Joi.object({}),

  // Update user status (admin only)
  updateUserStatus: Joi.object({
    userId: Joi.string().uuid().required(),
    status: Joi.string().valid('pending', 'verified', 'rejected').required(),
  }),

  // Create appointment
  createAppointment: Joi.object({
    providerId: Joi.string().uuid().required(),
    serviceIds: Joi.array().items(Joi.string().uuid()).min(1).required(),
    dateTime: Joi.date().greater('now').required(),
    notes: Joi.string().max(500).optional(),
  }),

  // Create subscription
  createSubscription: Joi.object({
    planType: Joi.string().valid(
      'client_premium',
      'solo_basic', 'solo_pro', 'solo_premium',
      'suite_starter', 'suite_growing', 'suite_pro', 'suite_elite'
    ).required(),
    paymentMethodId: Joi.string().optional(),
  }),

  // Create review
  createReview: Joi.object({
    providerId: Joi.string().uuid().required(),
    appointmentId: Joi.string().uuid().optional(),
    rating: Joi.number().integer().min(1).max(5).required(),
    comment: Joi.string().max(1000).optional(),
    type: Joi.string().valid('verified', 'semi_verified').default('verified'),
  }),

  // Send message
  sendMessage: Joi.object({
    conversationId: Joi.string().uuid().optional(),
    providerId: Joi.string().uuid().when('conversationId', {
      is: Joi.exist(),
      then: Joi.optional(),
      otherwise: Joi.required(),
    }),
    content: Joi.string().max(2000).when('messageType', {
      is: 'text',
      then: Joi.required(),
      otherwise: Joi.optional().allow('', null),
    }),
    messageType: Joi.string().valid('text', 'image', 'reel', 'video', 'voice').default('text'),
    attachments: Joi.object().when('messageType', {
      is: 'image',
      then: Joi.required(),
      otherwise: Joi.when('messageType', {
        is: 'video',
        then: Joi.object({
          videoUrl: Joi.string().required(),
          mimeType: Joi.string().allow('', null).optional(),
          fileName: Joi.string().allow('', null).optional(),
          fileSize: Joi.number().optional(),
        }).unknown(true).required(),
        otherwise: Joi.when('messageType', {
          is: 'voice',
          then: Joi.object({
            audioUrl: Joi.string().required(),
            duration: Joi.number().optional(),
            mimeType: Joi.string().allow('', null).optional(),
            fileName: Joi.string().allow('', null).optional(),
            fileSize: Joi.number().optional(),
          }).unknown(true).required(),
          otherwise: Joi.when('messageType', {
        is: 'reel',
        then: Joi.object({
          videoId: Joi.string().uuid().required(),
          thumbnailUrl: Joi.string().allow('', null).optional(),
          videoUrl: Joi.string().allow('', null).optional(),
          caption: Joi.string().allow('', null).optional(),
          ownerName: Joi.string().allow('', null).optional(),
          ownerAvatar: Joi.string().allow('', null).optional(),
          shareLink: Joi.string().allow('', null).optional(),
        }).required(),
        otherwise: Joi.optional(),
      }),
      }),
    }),
  }),

  // Create conversation
  createConversation: Joi.object({
    providerId: Joi.string().uuid().optional(),
    clientId: Joi.string().uuid().optional(),
    friendId: Joi.string().uuid().optional(),
  }).or('providerId', 'clientId', 'friendId'),

  // Create service
  createService: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    description: Joi.string().max(1000).optional(),
    category: Joi.string().valid(
      'hair', 'makeup', 'nails', 'lashes_brows', 'skincare', 
      'waxing', 'barber', 'aesthetics'
    ).required(),
    subcategory: Joi.string().max(50).optional(),
    price: Joi.number().positive().required(),
    duration: Joi.number().integer().positive().required(), // in minutes
    isActive: Joi.boolean().default(true),
  }),

  // Update marketplace
  updateMarketplace: Joi.object({
    businessName: Joi.string().min(2).max(100).optional(),
    bio: Joi.string().max(2000).optional(),
    address: Joi.string().max(200).optional(),
    phoneNumber: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).optional(),
  }),

  // Create referral
  createReferral: Joi.object({
    referralCode: Joi.string().alphanum().min(6).max(20).required(),
  }),

  // Pagination and filtering
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  }),

  // Search providers
  searchProviders: Joi.object({
    category: Joi.string().optional(),
    subcategory: Joi.string().optional(),
    location: Joi.string().optional(),
    radius: Joi.number().positive().max(100).default(25), // miles
    minRating: Joi.number().min(1).max(5).optional(),
    priceRange: Joi.object({
      min: Joi.number().positive().optional(),
      max: Joi.number().positive().optional(),
    }).optional(),
    availability: Joi.object({
      date: Joi.date().optional(),
      timeSlot: Joi.string().optional(),
    }).optional(),
  }),

  // Admin: list users (query params)
  adminListUsers: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    role: Joi.string().valid('client', 'solo', 'suite', 'admin').optional(),
    status: Joi.string().valid('pending', 'verified', 'rejected').optional(),
    search: Joi.string().trim().min(1).max(100).optional(),
  }),

  // Admin: get all reviews (query params)
  adminListReviews: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    status: Joi.string().valid('pending', 'approved', 'rejected').optional(),
    type: Joi.string().valid('verified', 'semi_verified').optional(),
    rating: Joi.number().integer().min(0).max(5).optional(),
    providerId: Joi.string().uuid().optional(),
    clientId: Joi.string().uuid().optional(),
    isPublic: Joi.boolean().optional(),
  }),

  flagReview: Joi.object({
    reviewDirection: Joi.string()
      .valid('client_to_provider', 'provider_to_client')
      .required(),
    reason: Joi.string().trim().max(1000).optional().allow('', null),
  }),

  adminReviewModeration: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    status: Joi.string().valid('pending', 'flagged', 'approved', 'rejected').optional(),
    moderationType: Joi.string().valid('flag', 'semi_verified', 'all').optional(),
    reviewDirection: Joi.string()
      .valid('client_to_provider', 'provider_to_client')
      .optional(),
  }),

  adminResolveFlag: Joi.object({
    status: Joi.string().valid('approved', 'rejected').required(),
    adminNote: Joi.string().trim().max(1000).optional().allow('', null),
  }),

  adminUpdateReviewStatus: Joi.object({
    status: Joi.string().valid('pending', 'approved', 'rejected').required(),
  }),

  adminUpdateReview: Joi.object({
    rating: Joi.number().integer().min(1).max(5).optional(),
    comment: Joi.string().max(1000).optional().allow('', null),
    providerRating: Joi.number().integer().min(1).max(5).optional(),
    providerResponse: Joi.string().max(1000).optional().allow('', null),
    status: Joi.string().valid('pending', 'approved', 'rejected').optional(),
    isPublic: Joi.boolean().optional(),
  }).min(1),

  adminReclassifyReview: Joi.object({
    type: Joi.string().valid('verified', 'semi_verified').required(),
  }),

  // Admin: get a user's booking history (query params)
  adminUserBookingHistory: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    status: Joi.string().valid('pending', 'canceled', 'postponed', 'availed', 'no_show').optional(),
  }),

  // Admin: payment analytics date range
  adminPaymentDateRange: Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
  }),

  // Admin: payment analytics with pagination
  adminPaymentPaginated: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    search: Joi.string().trim().min(1).max(100).optional(),
  }),

  // Admin: top paying clients
  adminPaymentTopClients: Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
    limit: Joi.number().integer().min(1).max(50).optional(),
  }),

  // Admin: update a user
  adminUpdateUser: Joi.object({
    name: Joi.string().trim().min(2).max(50).optional(),
    email: Joi.string().trim().email({ tlds: { allow: false } }).optional(),
    phone: Joi.string().trim().pattern(/^\+?[\d\s\-\(\)]+$/).optional().allow(null, ''),
    role: Joi.string().valid('client', 'solo', 'suite', 'admin').optional(),
    businessName: Joi.string().trim().min(2).max(100).optional().allow(null, ''),
    status: Joi.string().valid('pending', 'verified', 'rejected').optional().allow(null),
    accountVerified: Joi.boolean().optional(),
    password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)')).optional()
      .messages({
        'string.min': 'Password must be at least 8 characters long',
        'string.pattern.base': 'Password must contain at least one lowercase letter, one uppercase letter, and one number'
      }),
  }).min(1),

  createContentReport: Joi.object({
    reportedUserId: Joi.string().uuid().required(),
    contentType: Joi.string()
      .valid("message", "photo", "service_listing", "profile")
      .required(),
    contentId: Joi.string().trim().min(1).max(1000).required(),
    reason: Joi.string()
      .valid(
        "inappropriate_content",
        "nudity",
        "misleading_information",
        "impersonation",
        "harassment"
      )
      .required(),
    details: Joi.string().trim().max(1000).optional().allow("", null),
    originalUserId: Joi.string().uuid().optional().allow("", null),
    contentPreview: Joi.string().trim().max(2000).optional().allow("", null),
    contentThumbnailUrl: Joi.string().trim().max(2000).optional().allow("", null),
  }),

  adminListContentReports: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    contentType: Joi.string()
      .valid("message", "photo", "service_listing", "profile", "all")
      .optional(),
    reason: Joi.string()
      .valid(
        "inappropriate_content",
        "nudity",
        "misleading_information",
        "impersonation",
        "harassment"
      )
      .optional(),
    status: Joi.string()
      .valid("pending", "dismissed", "warned", "suspended", "all")
      .optional(),
    search: Joi.string().trim().min(1).max(100).optional(),
  }),

  adminResolveContentReport: Joi.object({
    action: Joi.string().valid("dismiss", "warn", "suspend").required(),
    adminNote: Joi.string().trim().max(300).optional().allow("", null),
  }),

  createAnnouncement: Joi.object({
    title: Joi.string().trim().min(1).max(200).required(),
    description: Joi.string().trim().max(5000).optional().allow("", null),
    iconType: Joi.string()
      .valid("megaphone", "gift", "wrench", "star", "warning")
      .optional(),
    audience: Joi.string()
      .valid("all_users", "active_users", "clients", "providers")
      .required(),
    type: Joi.string()
      .valid(
        "policy_update",
        "promotion",
        "system_update",
        "feature_update",
        "alert"
      )
      .required(),
    status: Joi.string()
      .valid("draft", "scheduled", "published")
      .optional(),
    scheduledAt: Joi.date().iso().optional().allow(null),
    expiresAt: Joi.date().iso().optional().allow(null),
  }),

  updateAnnouncement: Joi.object({
    title: Joi.string().trim().min(1).max(200).optional(),
    description: Joi.string().trim().max(5000).optional().allow("", null),
    iconType: Joi.string()
      .valid("megaphone", "gift", "wrench", "star", "warning")
      .optional(),
    audience: Joi.string()
      .valid("all_users", "active_users", "clients", "providers")
      .optional(),
    type: Joi.string()
      .valid(
        "policy_update",
        "promotion",
        "system_update",
        "feature_update",
        "alert"
      )
      .optional(),
    status: Joi.string()
      .valid("draft", "scheduled", "published", "expired")
      .optional(),
    scheduledAt: Joi.date().iso().optional().allow(null),
    expiresAt: Joi.date().iso().optional().allow(null),
  }).min(1),

  scheduleAnnouncement: Joi.object({
    scheduledAt: Joi.date().iso().required(),
  }),

  adminListAnnouncements: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    status: Joi.string()
      .valid("draft", "scheduled", "published", "expired", "all")
      .optional(),
    type: Joi.string()
      .valid(
        "policy_update",
        "promotion",
        "system_update",
        "feature_update",
        "alert"
      )
      .optional(),
    audience: Joi.string()
      .valid("all_users", "active_users", "clients", "providers")
      .optional(),
    search: Joi.string().trim().min(1).max(100).optional(),
  }),

  createSupportTicket: Joi.object({
    category: Joi.string()
      .valid("billing", "app_issue", "verification", "account", "payment")
      .required(),
    subject: Joi.string().trim().min(1).max(100).required(),
    description: Joi.string().trim().min(1).max(1000).required(),
    priority: Joi.string().valid("low", "medium", "high").optional(),
    attachments: Joi.array().items(Joi.string().trim().min(1)).max(5).optional(),
  }),

  adminCreateSupportTicket: Joi.object({
    userId: Joi.string().uuid().required(),
    category: Joi.string()
      .valid("billing", "app_issue", "verification", "account", "payment")
      .required(),
    subject: Joi.string().trim().min(1).max(100).required(),
    description: Joi.string().trim().min(1).max(1000).required(),
    priority: Joi.string().valid("low", "medium", "high").optional(),
    assignedToId: Joi.string().uuid().optional().allow(null, ""),
    attachments: Joi.array().items(Joi.string().trim().min(1)).max(5).optional(),
    status: Joi.string()
      .valid("open", "in_progress", "resolved", "closed")
      .optional(),
  }),

  updateSupportTicket: Joi.object({
    category: Joi.string()
      .valid("billing", "app_issue", "verification", "account", "payment")
      .optional(),
    subject: Joi.string().trim().min(1).max(100).optional(),
    description: Joi.string().trim().min(1).max(1000).optional(),
    status: Joi.string()
      .valid("open", "in_progress", "resolved", "closed")
      .optional(),
    priority: Joi.string().valid("low", "medium", "high").optional(),
    assignedToId: Joi.string().uuid().optional().allow(null, ""),
    attachments: Joi.array().items(Joi.string().trim().min(1)).max(5).optional(),
  }).min(1),

  addSupportTicketMessage: Joi.object({
    message: Joi.string().trim().min(1).max(2000).required(),
    attachments: Joi.array().items(Joi.string().trim().min(1)).max(5).optional(),
    isInternal: Joi.boolean().optional(),
  }),

  adminListSupportTickets: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    status: Joi.string()
      .valid("open", "in_progress", "resolved", "closed", "all")
      .optional(),
    category: Joi.string()
      .valid("billing", "app_issue", "verification", "account", "payment")
      .optional(),
    priority: Joi.string().valid("low", "medium", "high").optional(),
    search: Joi.string().trim().min(1).max(100).optional(),
    assignedToId: Joi.string().uuid().optional(),
    userId: Joi.string().uuid().optional(),
  }),

  listMySupportTickets: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    status: Joi.string()
      .valid("open", "in_progress", "resolved", "closed", "all")
      .optional(),
    category: Joi.string()
      .valid("billing", "app_issue", "verification", "account", "payment")
      .optional(),
    search: Joi.string().trim().min(1).max(100).optional(),
  }),
};

/**
 * Query parameter validation
 */
export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.query);
    
    if (error) {
      res.status(400).json({
        status: false,
        message: 'Query validation error',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
        })),
      });
      return;
    }
    
    next();
  };
};

/**
 * File upload validation
 */
export const validateFileUpload = (options: {
  allowedTypes?: string[];
  maxSize?: number; // in bytes
  required?: boolean;
}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const file = req.file;
    
    if (!file && options.required) {
      res.status(400).json({
        status: false,
        message: 'File upload is required',
      });
      return;
    }
    
    if (file) {
      // Check file type
      if (options.allowedTypes && !options.allowedTypes.includes(file.mimetype)) {
        res.status(400).json({
          status: false,
          message: `Invalid file type. Allowed types: ${options.allowedTypes.join(', ')}`,
        });
        return;
      }
      
      // Check file size
      if (options.maxSize && file.size > options.maxSize) {
        res.status(400).json({
          status: false,
          message: `File too large. Maximum size: ${options.maxSize / 1024 / 1024}MB`,
        });
        return;
      }
    }
    
    next();
  };
};

/**
 * UUID parameter validation
 */
export const validateUUID = (paramName: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const value = req.params[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (!uuidRegex.test(value)) {
      res.status(400).json({
        status: false,
        message: `Invalid ${paramName} format`,
      });
      return;
    }
    
    next();
  };
};
