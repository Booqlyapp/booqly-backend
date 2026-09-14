import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// File validation constants
export const ALLOWED_MIMETYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png", 
  "image/webp",
  "image/gif",
];

export const ALLOWED_VIDEO_MIMETYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "video/x-matroska",
  "video/3gpp",
  "video/3gpp2",
];

export const ALLOWED_PDF_MIMETYPES = [
  "application/pdf",
];

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_VIDEO_FILE_SIZE = 250 * 1024 * 1024; // 250MB
export const MAX_IMAGES = 10;

/**
 * Generate unique filename
 */
const generateUniqueFilename = (originalname: string, prefix?: string): string => {
  const fileExtension = path.extname(originalname);
  const timestamp = Date.now();
  const uuid = uuidv4().split('-')[0]; // Short UUID
  
  if (prefix) {
    return `${prefix}-${timestamp}-${uuid}${fileExtension}`;
  }
  
  return `${timestamp}-${uuid}${fileExtension}`;
};

/**
 * Get upload subfolder based on route or purpose
 */
const getUploadSubfolder = (purpose: string): string => {
  switch (purpose) {
    case 'profile-pic':
      return 'profile-pics';
    case 'marketplace-images':
      return 'marketplace-images';
    case 'portfolio-images':
      return 'marketplace-portfolio';
    case 'web-header':
      return 'marketplace-web-header';
    case 'web-header-pdf':
      return 'marketplace-web-header-pdf';
    case 'service-images':
      return 'marketplace-service-images';
    case 'verification-docs':
      return 'verification-docs';
    case 'chat-images':
      return 'chat-images';
    case 'chat-videos':
      return 'chat-videos';
    case 'support-attachments':
      return 'support-attachments';
    case 'videos':
      return 'videos';
    case 'video-thumbnails':
      return 'video-thumbnails';
    default:
      return 'misc';
  }
};

const isAllowedVideoExtension = (originalname: string): boolean => {
  const ext = path.extname(originalname).toLowerCase();
  return ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v', '.3gp'].includes(ext);
};

const videoMediaFileFilter = (req: any, file: any, cb: any) => {
  if (file.fieldname === 'thumbnail') {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
      return;
    }

    if (file.mimetype === 'application/octet-stream') {
      const ext = path.extname(file.originalname).toLowerCase();
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

      if (allowedExtensions.includes(ext)) {
        cb(null, true);
        return;
      }
    }

    cb(new Error(`Invalid thumbnail type "${file.mimetype}". Only image files are allowed.`), false);
    return;
  }

  if (ALLOWED_VIDEO_MIMETYPES.includes(file.mimetype) || (file.mimetype === 'application/octet-stream' && isAllowedVideoExtension(file.originalname))) {
    cb(null, true);
    return;
  }

  cb(new Error(`Invalid video type "${file.mimetype}". Only video files are allowed.`), false);
};

/**
 * Create multer storage configuration
 */
export const createMulterStorage = (purpose: string) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const subfolder = getUploadSubfolder(purpose);
      const uploadPath = path.join(process.cwd(), 'uploads', subfolder);
      
      // Ensure directory exists
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
        console.log(`Created upload directory: ${uploadPath}`);
      }
      
      cb(null, uploadPath);
    },
    filename: (req: any, file, cb) => {
      let prefix = '';
      
      // Generate appropriate prefix based on purpose and user context
      if (purpose === 'profile-pic' && req.user) {
        prefix = `user-${req.user.id}`;
      } else if (purpose === 'marketplace-images' && req.body.marketplaceId) {
        prefix = `marketplace-${req.body.marketplaceId}`;
      } else if (purpose === 'portfolio-images' && req.body.marketplaceId) {
        prefix = `portfolio-${req.body.marketplaceId}`;
      } else if (purpose === 'web-header' && req.body.marketplaceId) {
        prefix = `header-${req.body.marketplaceId}`;
      } else if (purpose === 'web-header-pdf' && req.body.marketplaceId) {
        prefix = `header-pdf-${req.body.marketplaceId}`;
      } else if (purpose === 'service-images' && req.body.marketplaceId) {
        prefix = `service-${req.body.marketplaceId}`;
      }
      
      const filename = generateUniqueFilename(file.originalname, prefix);
      cb(null, filename);
    }
  });
};

/**
 * Create dynamic storage for web header (routes PDFs to separate folder)
 */
export const createWebHeaderDynamicStorage = () => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      // Route PDFs to web-header-pdf folder, images to web-header folder
      const isPdf = ALLOWED_PDF_MIMETYPES.includes(file.mimetype);
      const subfolder = getUploadSubfolder(isPdf ? 'web-header-pdf' : 'web-header');
      const uploadPath = path.join(process.cwd(), 'uploads', subfolder);
      
      // Ensure directory exists
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
        console.log(`Created upload directory: ${uploadPath}`);
      }
      
      cb(null, uploadPath);
    },
    filename: (req: any, file, cb) => {
      const isPdf = ALLOWED_PDF_MIMETYPES.includes(file.mimetype);
      const prefix = req.body.marketplaceId 
        ? `header-${isPdf ? 'pdf-' : ''}${req.body.marketplaceId}`
        : '';
      
      const filename = generateUniqueFilename(file.originalname, prefix);
      cb(null, filename);
    }
  });
};

/**
 * File filter function
 */
export const fileFilter = (req: any, file: any, cb: any) => {
  console.log('File filter check:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    fieldname: file.fieldname
  });
  
  // Check if it's an allowed MIME type
  if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
    return;
  }
  
  // Handle cases where MIME type is detected as application/octet-stream
  // but the file extension suggests it's an image
  if (file.mimetype === 'application/octet-stream') {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    
    if (allowedExtensions.includes(ext)) {
      console.log('Allowing octet-stream file with valid image extension:', ext);
      cb(null, true);
      return;
    }
  }
  
  console.log('File rejected - mimetype not allowed:', file.mimetype);
  cb(new Error(`Invalid file type "${file.mimetype}". Only image files (JPEG, PNG, GIF, WebP) are allowed.`), false);
};

/**
 * File filter for web header (accepts both images and PDFs)
 */
export const webHeaderFileFilter = (req: any, file: any, cb: any) => {
  console.log('Web header file filter check:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    fieldname: file.fieldname
  });
  
  // Check if it's an allowed image or PDF
  if (ALLOWED_MIMETYPES.includes(file.mimetype) || ALLOWED_PDF_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
    return;
  }
  
  console.log('File rejected - mimetype not allowed:', file.mimetype);
  cb(new Error(`Invalid file type "${file.mimetype}". Only image files (JPEG, PNG, GIF, WebP) or PDF are allowed.`), false);
};

/**
 * Create multer upload middleware for profile pictures
 */
export const createProfilePicUpload = () => {
  return multer({
    storage: createMulterStorage('profile-pic'),
    limits: {
      fileSize: MAX_FILE_SIZE,
    },
    fileFilter,
  });
};

/**
 * Create multer upload middleware for marketplace images
 */
export const createMarketplaceImagesUpload = () => {
  return multer({
    storage: createMulterStorage('marketplace-images'),
    limits: {
      fileSize: MAX_FILE_SIZE,
    },
    fileFilter,
  });
};

/**
 * Create multer upload middleware for portfolio images
 */
export const createPortfolioImagesUpload = () => {
  return multer({
    storage: createMulterStorage('portfolio-images'),
    limits: {
      fileSize: MAX_FILE_SIZE,
    },
    fileFilter,
  });
};

/**
 * Create multer upload middleware for verification documents
 */
export const createVerificationDocsUpload = () => {
  return multer({
    storage: createMulterStorage('verification-docs'),
    limits: {
      fileSize: MAX_FILE_SIZE,
    },
    fileFilter,
  });
};

/**
 * Create multer upload middleware for identity documents (client IDs)
 */
export const createIdentityDocUpload = () => {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadPath = path.join(process.cwd(), 'uploads', 'verification-docs', 'identityCard');
        
        // Ensure directory exists
        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
          console.log(`Created upload directory: ${uploadPath}`);
        }
        
        cb(null, uploadPath);
      },
      filename: (req: any, file, cb) => {
        const prefix = req.user ? `user-${req.user.id}` : '';
        const filename = generateUniqueFilename(file.originalname, prefix);
        cb(null, filename);
      }
    }),
    limits: {
      fileSize: MAX_FILE_SIZE,
    },
    fileFilter,
  });
};

/**
 * Create multer upload middleware for professional license documents (solo)
 */
export const createProfessionalDocUpload = () => {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadPath = path.join(process.cwd(), 'uploads', 'verification-docs', 'licenseCard');

        // Ensure directory exists
        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
          console.log(`Created upload directory: ${uploadPath}`);
        }

        cb(null, uploadPath);
      },
      filename: (req: any, file, cb) => {
        const prefix = req.user ? `user-${req.user.id}` : '';
        const filename = generateUniqueFilename(file.originalname, prefix);
        cb(null, filename);
      }
    }),
    limits: {
      fileSize: MAX_FILE_SIZE,
    },
    fileFilter,
  });
};

/**
 * File filter for business documents (EIN / LLC). Accepts images and PDFs.
 */
const businessDocFileFilter = (req: any, file: any, cb: any) => {
  if (
    ALLOWED_MIMETYPES.includes(file.mimetype) ||
    ALLOWED_PDF_MIMETYPES.includes(file.mimetype)
  ) {
    cb(null, true);
    return;
  }

  if (file.mimetype === 'application/octet-stream') {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'];

    if (allowedExtensions.includes(ext)) {
      cb(null, true);
      return;
    }
  }

  cb(new Error(`Invalid file type "${file.mimetype}". Only images (JPG, PNG, WEBP) or PDF are allowed.`), false);
};

/**
 * Create multer upload middleware for business documents (solo)
 */
export const createBusinessDocUpload = () => {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadPath = path.join(process.cwd(), 'uploads', 'verification-docs', 'businessDoc');

        // Ensure directory exists
        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
          console.log(`Created upload directory: ${uploadPath}`);
        }

        cb(null, uploadPath);
      },
      filename: (req: any, file, cb) => {
        const prefix = req.user ? `user-${req.user.id}` : '';
        const filename = generateUniqueFilename(file.originalname, prefix);
        cb(null, filename);
      }
    }),
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
    fileFilter: businessDocFileFilter,
  });
};

/**
 * Create multer upload middleware for chat images
 */
export const createChatImageUpload = () => {
  return multer({
    storage: createMulterStorage('chat-images'),
    limits: {
      fileSize: MAX_FILE_SIZE,
    },
    fileFilter,
  });
};

/**
 * Create multer upload middleware for chat videos
 */
export const createChatVideoUpload = () => {
  return multer({
    storage: createMulterStorage('chat-videos'),
    limits: {
      fileSize: MAX_VIDEO_FILE_SIZE,
    },
    fileFilter: videoMediaFileFilter,
  });
};

/**
 * Create multer upload middleware for booking page header images and PDFs
 */
export const createWebHeaderUpload = () => {
  return multer({
    storage: createWebHeaderDynamicStorage(),
    limits: {
      fileSize: MAX_FILE_SIZE,
    },
    fileFilter: webHeaderFileFilter,
  });
};

/**
 * Create multer upload middleware for service images
 */
export const createServiceImageUpload = () => {
  return multer({
    storage: createMulterStorage('service-images'),
    limits: {
      fileSize: MAX_FILE_SIZE,
    },
    fileFilter,
  });
};

/**
 * Create multer upload middleware for videos and optional thumbnails
 */
export const createVideoUpload = () => {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const purpose = file.fieldname === 'thumbnail' ? 'video-thumbnails' : 'videos';
        const uploadPath = path.join(process.cwd(), 'uploads', getUploadSubfolder(purpose));

        if (!fs.existsSync(uploadPath)) {
          fs.mkdirSync(uploadPath, { recursive: true });
          console.log(`Created upload directory: ${uploadPath}`);
        }

        cb(null, uploadPath);
      },
      filename: (req: any, file, cb) => {
        const prefix = req.user ? `user-${req.user.id}` : 'video';
        const suffix = file.fieldname === 'thumbnail' ? 'thumb' : 'video';
        const filename = generateUniqueFilename(file.originalname, `${prefix}-${suffix}`);
        cb(null, filename);
      },
    }),
    limits: {
      fileSize: MAX_VIDEO_FILE_SIZE,
    },
    fileFilter: videoMediaFileFilter,
  });
};

/**
 * Create multer upload middleware for support ticket attachments (PNG/JPG/PDF up to 10MB)
 */
export const createSupportAttachmentUpload = () => {
  const supportFileFilter = (_req: any, file: any, cb: any) => {
    const allowed = [...ALLOWED_MIMETYPES, ...ALLOWED_PDF_MIMETYPES];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only PNG, JPG, and PDF files are allowed"), false);
  };

  return multer({
    storage: createMulterStorage("support-attachments"),
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
    fileFilter: supportFileFilter,
  });
};

/**
 * General upload middleware (for backward compatibility)
 */
export const upload = createChatImageUpload();
