import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/user_model';
import { SubscriptionService } from '../services/subscription.service';

export interface AuthRequest extends Request {
  user?: User;
  userId?: string;
}

/**
 * Verify JWT token and attach user to request
 */
export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        status: false,
        message: 'Access token required',
      });
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY!) as any;
    
    const user = await User.findByPk(decoded.id);
    if (!user) {
      res.status(401).json({
        status: false,
        message: 'Invalid token - user not found',
      });
      return;
    }

    if (user.isSuspended) {
      res.status(403).json({
        status: false,
        message: 'Your account has been suspended. Contact support if you think this is a mistake.',
      });
      return;
    }

    req.user = user;
    req.userId = user.id;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({
      status: false,
      message: 'Invalid or expired token',
    });
  }
};

/**
 * Check if user has specific role
 */
export const requireRole = (roles: string | string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        status: false,
        message: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
};

/**
 * Check if user is verified
 */
export const requireVerification = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (!req.user) {
    res.status(401).json({
      status: false,
      message: 'Authentication required',
    });
    return;
  }

  if (req.user.status !== 'verified') {
    res.status(403).json({
      status: false,
      message: 'Account verification required',
    });
    return;
  }

  next();
};

/**
 * Check if user has active subscription (for paid features)
 */
export const requireActiveSubscription = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        status: false,
        message: 'Authentication required',
      });
      return;
    }

    const subscriptionInfo = await SubscriptionService.getUserSubscriptionInfo(req.user.id);
    
    if (!subscriptionInfo.hasActiveSubscription) {
      res.status(403).json({
        status: false,
        message: 'Active subscription required',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({
      status: false,
      message: 'Error checking subscription status',
    });
  }
};

/**
 * Check if user has access to specific feature
 */
export const requireFeatureAccess = (feature: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          status: false,
          message: 'Authentication required',
        });
        return;
      }

      const hasAccess = await SubscriptionService.hasFeatureAccess(req.user.id, feature);
      
      if (!hasAccess) {
        res.status(403).json({
          status: false,
          message: `Feature '${feature}' requires subscription upgrade`,
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Feature access check error:', error);
      res.status(500).json({
        status: false,
        message: 'Error checking feature access',
      });
    }
  };
};

/**
 * Optional authentication - attach user if token is valid, but don't require it
 */
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY!) as any;
      const user = await User.findByPk(decoded.id);
      
      if (user) {
        req.user = user;
        req.userId = user.id;
      }
    }

    next();
  } catch (error) {
    // Ignore auth errors for optional auth
    next();
  }
};

/**
 * Rate limiting for subscription-based features
 */
export const subscriptionRateLimit = (feature: string, limits: Record<string, number>) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          status: false,
          message: 'Authentication required',
        });
        return;
      }

      const subscriptionInfo = await SubscriptionService.getUserSubscriptionInfo(req.user.id);
      const userLimit = limits[subscriptionInfo.planType] || limits.default || 0;

      if (userLimit === 0) {
        res.status(403).json({
          status: false,
          message: 'Feature not available in your plan',
        });
        return;
      }

      // Here you would implement actual rate limiting logic
      // For now, we'll just pass through
      next();
    } catch (error) {
      console.error('Rate limit check error:', error);
      res.status(500).json({
        status: false,
        message: 'Error checking rate limits',
      });
    }
  };
};
