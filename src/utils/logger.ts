import pino from 'pino';
import { Log } from '../models/log_model';

// Pino log levels
// const LOG_LEVELS = {
//   trace: 10,
//   debug: 20,
//   info: 30,
//   warn: 40,
//   error: 50,
//   fatal: 60,
// };

// Custom database transport
// const databaseTransport = pino.transport({
//   target: 'pino/file',
//   options: {
//     destination: 1, // stdout
//   },
// });

// Create custom database stream
const databaseStream = {
  write: async (chunk: string) => {
    try {
      const logData = JSON.parse(chunk);
      
      // Map Pino log level numbers to names
      const levelNames: { [key: number]: string } = {
        10: 'trace',
        20: 'debug', 
        30: 'info',
        40: 'warn',
        50: 'error',
        60: 'fatal',
      };

      // Save to database
      const logEntry: Partial<any> = {
        level: logData.level || 30,
        levelName: levelNames[logData.level] || 'unknown',
        time: typeof logData.time === 'string' ? new Date(logData.time).getTime() : (logData.time || Date.now()),
        pid: logData.pid,
        hostname: logData.hostname,
        reqId: logData.reqId,
        userId: logData.userId,
        method: logData.method,
        url: logData.url,
        statusCode: logData.statusCode,
        responseTime: logData.responseTime,
        userAgent: logData.userAgent,
        ip: logData.ip,
        msg: logData.msg || '',
        module: logData.module,
        action: logData.action,
        metadata: logData.metadata || null,
        error: logData.err || null,
      };
      
      await Log.create(logEntry as any);
    } catch (error) {
      // Fallback to console if database fails
      console.error('Failed to write log to database:', error);
      console.log(chunk);
    }
  }
};

// Create logger instance
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label: any, number: number) => {
      return { level: number };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    pid: process.pid,
    hostname: process.env.HOSTNAME || require('os').hostname(),
  },
}, pino.multistream([
  // Console output (pretty in development)
  {
    level: 'info',
    stream: process.env.NODE_ENV === 'development' 
      ? pino.transport({
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname',
          },
        })
      : process.stdout
  },
  // Database output
  {
    level: 'info',
    stream: databaseStream
  }
]));

// Enhanced logging methods
export const log = {
  // Basic logging
  trace: (msg: string, meta?: any) => logger.trace(meta, msg),
  debug: (msg: string, meta?: any) => logger.debug(meta, msg),
  info: (msg: string, meta?: any) => logger.info(meta, msg),
  warn: (msg: string, meta?: any) => logger.warn(meta, msg),
  error: (msg: string, error?: any, meta?: any) => {
    const errorData = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : error;
    logger.error({ err: errorData, ...meta }, msg);
  },
  fatal: (msg: string, error?: any, meta?: any) => {
    const errorData = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : error;
    logger.fatal({ err: errorData, ...meta }, msg);
  },

  // Business logic logging
  auth: (action: string, userId?: string, meta?: any) => {
    logger.info({ 
      module: 'auth', 
      action, 
      userId,
      ...meta 
    }, `Auth: ${action}`);
  },

  marketplace: (action: string, userId?: string, marketplaceId?: string, meta?: any) => {
    logger.info({ 
      module: 'marketplace', 
      action, 
      userId,
      marketplaceId,
      ...meta 
    }, `Marketplace: ${action}`);
  },

  appointment: (action: string, userId?: string, appointmentId?: string, meta?: any) => {
    logger.info({ 
      module: 'appointment', 
      action, 
      userId,
      appointmentId,
      ...meta 
    }, `Appointment: ${action}`);
  },

  payment: (action: string, userId?: string, amount?: number, meta?: any) => {
    logger.info({ 
      module: 'payment', 
      action, 
      userId,
      amount,
      ...meta 
    }, `Payment: ${action}`);
  },

  chat: (action: string, userId?: string, conversationId?: string, meta?: any) => {
    logger.info({ 
      module: 'chat', 
      action, 
      userId,
      conversationId,
      ...meta 
    }, `Chat: ${action}`);
  },

  subscription: (action: string, userId?: string, planId?: string, meta?: any) => {
    logger.info({ 
      module: 'subscription', 
      action, 
      userId,
      planId,
      ...meta 
    }, `Subscription: ${action}`);
  },

  // HTTP request logging
  http: (method: string, url: string, statusCode: number, responseTime: number, userId?: string, ip?: string, userAgent?: string) => {
    logger.info({
      module: 'http',
      action: 'request',
      method,
      url,
      statusCode,
      responseTime,
      userId,
      ip,
      userAgent,
    }, `${method} ${url} ${statusCode} - ${responseTime}ms`);
  },
};

export default logger;
