import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';

const parseExcludedRateLimitPaths = (): string[] => {
  const configured = (process.env.RATE_LIMIT_EXCLUDE_PATHS || '')
    .split(',')
    .map((path) => path.trim())
    .filter((path) => path.length > 0);

  // Keep local development smooth for frequently refreshed screens.
  if (process.env.NODE_ENV === 'development') {
    configured.push('/appointment/get-user-appointments');
  }

  return Array.from(new Set(configured));
};

const shouldSkipGeneralRateLimit = (req: Request): boolean => {
  if (req.method === 'OPTIONS') {
    return true;
  }

  const excludedPaths = parseExcludedRateLimitPaths();
  if (excludedPaths.length === 0) {
    return false;
  }

  return excludedPaths.some((path) => req.path === path || req.path.startsWith(`${path}/`));
};

/**
 * General API rate limiting
 */
export const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 100 requests per windowMs
  skip: shouldSkipGeneralRateLimit,
  message: {
    status: false,
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiting for authentication endpoints
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 5 requests per windowMs
  message: {
    status: false,
    message: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiting for file uploads
 */
export const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 10 uploads per windowMs
  message: {
    status: false,
    message: 'Too many file uploads, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiting for messaging
 */
export const messageRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 messages per minute
  message: {
    status: false,
    message: 'Too many messages sent, please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiting for search endpoints
 */
export const searchRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 searches per minute
  message: {
    status: false,
    message: 'Too many search requests, please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Security headers middleware
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

/**
 * CORS configuration
 */
export const corsOptions = {
  origin: function (origin: string | undefined, callback: Function) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://booqly.app',
      'https://www.booqly.app',
      'https://admin.booqly.app',
      'https://booqlyapp.com',
      'https://www.booqlyapp.com',
    ];
    
    // Allow all subdomains of booqlyapp.com (for custom booking links)
    // Updated regex to properly match subdomains with hyphens
    const booqlySubdomainRegex = /^https:\/\/([a-z0-9-]+\.)?booqlyapp\.com$/i;
    
    // Allow localhost subdomains for development (e.g., elite-hair-studio.localhost:3000)
    const localhostSubdomainRegex = /^https?:\/\/([a-z0-9-]+\.)?localhost(:\d+)?$/i;
    
    if (process.env.NODE_ENV === 'development') {
      allowedOrigins.push('http://localhost:3000');
      allowedOrigins.push('http://127.0.0.1:3000');
    }
    
    // Check if origin matches allowed origins or subdomain patterns
    if (
      allowedOrigins.indexOf(origin) !== -1 ||
      booqlySubdomainRegex.test(origin) ||
      (process.env.NODE_ENV === 'development' && localhostSubdomainRegex.test(origin))
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

/**
 * Request logging middleware
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  // Log request
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - IP: ${req.ip}`);
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `${new Date().toISOString()} - ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`
    );
  });
  
  next();
};

/**
 * Error handling middleware
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error:', error);
  
  // Handle specific error types
  if (error.name === 'ValidationError') {
    res.status(400).json({
      status: false,
      message: 'Validation error',
      errors: error.message,
    });
    return;
  }
  
  if (error.name === 'UnauthorizedError') {
    res.status(401).json({
      status: false,
      message: 'Unauthorized access',
    });
    return;
  }
  
  if (error.name === 'SequelizeValidationError') {
    res.status(400).json({
      status: false,
      message: 'Database validation error',
      errors: error.message,
    });
    return;
  }
  
  if (error.name === 'SequelizeUniqueConstraintError') {
    res.status(409).json({
      status: false,
      message: 'Resource already exists',
    });
    return;
  }
  
  // Default error response
  res.status(500).json({
    status: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message,
  });
};

/**
 * 404 handler
 */
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    status: false,
    message: `Route ${req.method} ${req.url} not found`,
  });
};

/**
 * Input sanitization middleware
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Basic XSS protection - remove script tags and dangerous characters
  const sanitize = (obj: any): any => {
    if (typeof obj === 'string') {
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          sanitized[key] = sanitize(obj[key]);
        }
      }
      return sanitized;
    }
    
    return obj;
  };
  
  if (req.body) {
    req.body = sanitize(req.body);
  }
  
  // Note: req.query and req.params are read-only in newer Express versions
  // Input sanitization is handled by express.json() and express.urlencoded() middleware
  
  next();
};

/**
 * API version middleware
 */
export const apiVersion = (version: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Use a custom property instead of modifying headers directly
    (req as any).apiVersion = version;
    res.setHeader('API-Version', version);
    next();
  };
};

/**
 * Request size limiter
 */
export const requestSizeLimiter = (limit: string = '10mb') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.headers['content-length'];
    const isMultipartUpload = typeof req.headers['content-type'] === 'string'
      && req.headers['content-type'].includes('multipart/form-data');
    const effectiveLimit = isMultipartUpload
      ? process.env.MULTIPART_REQUEST_LIMIT || '250mb'
      : limit;
    
    if (contentLength) {
      const sizeInMB = parseInt(contentLength) / (1024 * 1024);
      const limitInMB = parseInt(effectiveLimit.replace('mb', ''));
      
      if (sizeInMB > limitInMB) {
        res.status(413).json({
          status: false,
          message: `Request too large. Maximum size is ${effectiveLimit}`,
        });
        return;
      }
    }
    
    next();
  };
};

/**
 * IP whitelist middleware (for admin endpoints)
 */
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (process.env.NODE_ENV === 'development') {
      return next(); // Skip IP checking in development
    }
    
    if (!clientIP || !allowedIPs.includes(clientIP)) {
      res.status(403).json({
        status: false,
        message: 'Access denied from this IP address',
      });
      return;
    }
    
    next();
  };
};

/**
 * Maintenance mode middleware
 */
export const maintenanceMode = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.MAINTENANCE_MODE === 'true') {
    // Allow health check and admin endpoints during maintenance
    if (req.url === '/health' || req.url.startsWith('/admin')) {
      return next();
    }
    
    res.status(503).json({
      status: false,
      message: 'Service temporarily unavailable for maintenance',
      retryAfter: '3600', // 1 hour
    });
    return;
  }
  
  next();
};
