import { Router } from "express";
import {
  updateTableField,
  getTableRecord,
  listAvailableTables,
  updateUserStatus,
  verifyUser,
  addTestUsers,
  addTestMarketplaces
} from "../controllers/debug_controller";
import { authenticateToken, requireRole } from "../middlewares/auth.middleware";

const router = Router();

// These routes allow arbitrary DB reads/writes with no other safety checks.
// Require an authenticated admin even in dev, as a second layer of
// protection beyond the NODE_ENV check that keeps this router unmounted
// in production (see routes/index.ts).
router.use(authenticateToken, requireRole("admin"));

/**
 * 🛠️ DEBUG ROUTES - Development & Testing Only
 *
 * SECURITY WARNING: These routes should NEVER be deployed to production!
 * They allow direct database manipulation and bypass all business logic.
 *
 * Usage Examples:
 * 
 * 1. Update any field in any table:
 *    PUT /debug/update-field
 *    Body: {
 *      "tableName": "users",
 *      "fieldName": "status", 
 *      "fieldValue": "verified",
 *      "whereField": "email",
 *      "whereValue": "user@example.com"
 *    }
 * 
 * 2. Get record from any table:
 *    GET /debug/get-record?tableName=users&whereField=id&whereValue=user-id-123
 * 
 * 3. List all available tables:
 *    GET /debug/tables
 * 
 * 4. Quick user status update:
 *    PUT /debug/user-status
 *    Body: {
 *      "email": "user@example.com",
 *      "status": "verified"
 *    }
 * 
 * 5. Quick user verification (sets both accountVerified and status):
 *    PUT /debug/verify-user
 *    Body: {
 *      "email": "user@example.com"
 *    }
 * 
 * 6. Add test users (creates client, solo, suite users):
 *    POST /debug/add-test-users
 *    Body: {} (no body required)
 * 
 * 7. Add test marketplaces (creates marketplaces for solo and suite users):
 *    POST /debug/add-test-marketplaces
 *    Body: {} (no body required)
 */

// Update any field in any table
router.put("/update-field", updateTableField);

// Get record from any table  
router.get("/get-record", getTableRecord);

// List all available tables and fields
router.get("/tables", listAvailableTables);

// Quick user status update (common operation)
router.put("/user-status", updateUserStatus);

// Quick user verification (sets accountVerified=true and status="verified")
router.put("/verify-user", verifyUser);

// Add test users (creates client, solo, suite test users)
router.post("/add-test-users", addTestUsers);

// Add test marketplaces (creates marketplaces for solo and suite users)
router.post("/add-test-marketplaces", addTestMarketplaces);

export default router;
