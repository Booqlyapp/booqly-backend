import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

/**
 * Middleware to check if client has uploaded government-issued ID
 * Required before booking or chatting with providers
 */
export const requireClientIdentityDocument = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      status: false,
      message: 'Authentication required',
    });
    return;
  }

  // Only check for clients
  if (req.user.role !== 'client') {
    next();
    return;
  }

  // Check if client has uploaded identity document
  if (!req.user.identityDocumentUrl) {
    res.status(403).json({
      status: false,
      message: 'Identity verification required',
      requiresIdentityDocument: true,
      reason: 'Please upload a government-issued ID to continue. This is required before booking appointments or chatting with providers.',
    });
    return;
  }

  next();
};
