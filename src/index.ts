import express from "express";
import { createServer } from "http";
import cors from "cors";
import sequelize from "./config/database";
import { ensureDatabaseEnums } from "./utils/ensure-database-enums";
import { ensureReviewFlagsTable } from "./utils/ensure-review-flags-table";
import { ensureContentReportsTable } from "./utils/ensure-content-reports-table";
import { ensureAnnouncementsTable } from "./utils/ensure-announcements-table";
import { ensureSupportTicketsTables } from "./utils/ensure-support-tickets-tables";
import { ensureVideosShortCodeColumn, backfillVideoShortCodes } from "./utils/ensure-video-short-codes";
import { initModels } from "./models/index";
import routes from "./routes/index";
import { SocketService } from "./services/socket.service";
import { NotificationService } from "./services/notification.service";
import { WaitlistService } from "./services/waitlist.service";
import {
  generalRateLimit,
  authRateLimit,
  securityHeaders,
  corsOptions,
  requestLogger,
  errorHandler,
  notFoundHandler,
  sanitizeInput,
  requestSizeLimiter,
  maintenanceMode,                             
} from "./middlewares/security.middleware";
import { httpLoggingMiddleware, errorLoggingMiddleware } from "./middlewares/logging.middleware";
import path from "path";

const app = express();
const server = createServer(app);

// Health check endpoint (before all middleware)
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: "1.0.0",
  });
});

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(securityHeaders);
app.use(maintenanceMode);
app.use(requestLogger);
app.use(httpLoggingMiddleware); // Add Pino logging
app.use(sanitizeInput);
app.use(requestSizeLimiter('50mb'));

// CORS
app.use(cors(corsOptions));

// Stripe webhook endpoint needs raw body for signature verification
app.use('/webhook/stripe', express.raw({ type: 'application/json' }));

// Body parsing for other endpoints
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting
app.use('/auth', authRateLimit);
app.use('/', generalRateLimit);

// Models initialization
initModels(sequelize);

// Static file serving for uploads with CORS headers
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
}, express.static(path.join(__dirname, '../uploads'), {
  acceptRanges: true,
  setHeaders: (res, filePath) => {
    if (/\.(mp4|mov|m4v|webm|3gp|mkv)$/i.test(filePath)) {
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
  },
}));

// Android App Links verification 
app.use('/.well-known', express.static(path.join(process.cwd(), '.well-known')));

// API routes (no /api prefix since we're using api subdomain)
app.use("/", routes);

// Socket.io setup
const socketService = new SocketService(server);

// Make socket service globally accessible
(global as any).socketService = socketService;

// Fail loudly at boot if Firebase Admin / FCM credentials are broken.
NotificationService.warmupFirebase();

// Error handling middleware (must be last)
app.use(notFoundHandler);
app.use(errorLoggingMiddleware); // Add error logging before error handler
app.use(errorHandler);

const PORT = Number(process.env.APP_PORT) || 3000;

// Database connection
sequelize
  .authenticate()
  .then(async () => {
    await ensureDatabaseEnums(sequelize);
    await ensureReviewFlagsTable(sequelize);
    await ensureContentReportsTable(sequelize);
    await ensureAnnouncementsTable(sequelize);
    await ensureSupportTicketsTables(sequelize);
    await ensureVideosShortCodeColumn(sequelize);
    void backfillVideoShortCodes(sequelize);
    console.log(`✅ ${process.env.NODE_ENV} Database connected successfully`);
    console.log(`📊 Database: ${sequelize.getDatabaseName()}`);
    WaitlistService.startProcessor();
  })
  .catch((err) => {
    console.error("❌ Unable to connect to the database:", err);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
    process.exit(0);
  });
});

// Start server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Booqly Server running on port ${PORT}`);
  console.log(`📡 Socket.io server ready for real-time connections`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔒 Security middleware enabled`);
  console.log(`⚡ Rate limiting active`);
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔗 API Base URL: http://localhost:${PORT}`);
    console.log(`📋 Health Check: http://localhost:${PORT}/health`);
  }
});

// Local storage is now used instead of S3

/*
* Create New Migration File:
npx sequelize-cli migration:generate --name <name-here>

* Migration UP:
npx sequelize-cli db:migrate --name <name-here>

* Migration DOWN:
npx sequelize-cli db:migrate:undo --name <name-here>
*/
