import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { log } from '../utils/logger';

// Extend Request interface to include logging properties
declare global {
  namespace Express {
    interface Request {
      reqId?: string;
      startTime?: number;
      userId?: string;
    }
  }
}

// HTTP request logging middleware
export const httpLoggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Generate unique request ID
  req.reqId = uuidv4();
  req.startTime = Date.now();

  // Extract user ID from JWT token if available
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(token) as any;
      req.userId = decoded?.userId;
    } catch (error) {
      // Ignore JWT decode errors for logging
    }
  }

  // Log request start
  log.info(`${req.method} ${req.originalUrl} - Started`, {
    reqId: req.reqId,
    method: req.method,
    url: req.originalUrl,
    userId: req.userId,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    module: 'http',
    action: 'request_start',
  });

  // Override res.end to log response
  const originalEnd = res.end.bind(res);
  res.end = function(chunk?: any, encoding?: any, cb?: any) {
    const responseTime = Date.now() - (req.startTime || Date.now());
    
    // Log HTTP request completion
    log.http(
      req.method,
      req.originalUrl,
      res.statusCode,
      responseTime,
      req.userId,
      req.ip || req.connection.remoteAddress,
      req.get('User-Agent')
    );

    // Log detailed completion
    log.info(`${req.method} ${req.originalUrl} - Completed`, {
      reqId: req.reqId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime,
      userId: req.userId,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      module: 'http',
      action: 'request_complete',
    });

    // Call original end method
    return originalEnd(chunk, encoding, cb);
  };

  next();
};

// Error logging middleware
export const errorLoggingMiddleware = (error: any, req: Request, res: Response, next: NextFunction) => {
  const responseTime = Date.now() - (req.startTime || Date.now());

  // Log error details
  log.error(`${req.method} ${req.originalUrl} - Error`, error, {
    reqId: req.reqId,
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode || 500,
    responseTime,
    userId: req.userId,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    module: 'http',
    action: 'request_error',
    metadata: {
      body: req.body,
      params: req.params,
      query: req.query,
    }
  });

  next(error);
};

// Business logic logging helpers
export const logAuth = (action: string, req: Request, meta?: any) => {
  log.auth(action, req.userId, {
    reqId: req.reqId,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    ...meta
  });
};

export const logMarketplace = (action: string, req: Request, marketplaceId?: string, meta?: any) => {
  log.marketplace(action, req.userId, marketplaceId, {
    reqId: req.reqId,
    ip: req.ip,
    ...meta
  });
};

export const logAppointment = (action: string, req: Request, appointmentId?: string, meta?: any) => {
  log.appointment(action, req.userId, appointmentId, {
    reqId: req.reqId,
    ip: req.ip,
    ...meta
  });
};

export const logPayment = (action: string, req: Request, amount?: number, meta?: any) => {
  log.payment(action, req.userId, amount, {
    reqId: req.reqId,
    ip: req.ip,
    ...meta
  });
};

export const logChat = (action: string, req: Request, conversationId?: string, meta?: any) => {
  log.chat(action, req.userId, conversationId, {
    reqId: req.reqId,
    ip: req.ip,
    ...meta
  });
};

export const logSubscription = (action: string, req: Request, planId?: string, meta?: any) => {
  log.subscription(action, req.userId, planId, {
    reqId: req.reqId,
    ip: req.ip,
    ...meta
  });
};
