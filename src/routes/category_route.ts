import { Router } from "express";
import {
  getCategories,
  getCategoryById,
  getSubcategoriesByCategory,
  searchCategories,
  createCategory,
  createSubcategory,
  updateCategory,
  updateCategoryStatus,
  deleteCategory,
  updateSubcategory,
  updateSubcategoryStatus,
  deleteSubcategory,
  getCategoryStats,
} from "../controllers/category_controller";
import { authenticateToken, requireRole } from "../middlewares/auth.middleware";

const router = Router();

// Public routes - no authentication required
router.get("/", getCategories);
router.get("/search", searchCategories);
router.get("/stats", authenticateToken, requireRole("admin"), getCategoryStats);
router.get("/:id", getCategoryById);
router.get("/:categoryId/subcategories", getSubcategoriesByCategory);

// Category management (Admin only)
router.post("/", authenticateToken, requireRole("admin"), createCategory);
router.put("/:id", authenticateToken, requireRole("admin"), updateCategory);
router.patch("/:id/status", authenticateToken, requireRole("admin"), updateCategoryStatus);
router.delete("/:id", authenticateToken, requireRole("admin"), deleteCategory);

// Subcategory creation stays open to any authenticated user - providers can add
// a custom subcategory inline while setting up a service.
router.post("/subcategories", authenticateToken, createSubcategory);

// Subcategory management (Admin only)
router.put("/subcategories/:id", authenticateToken, requireRole("admin"), updateSubcategory);
router.patch("/subcategories/:id/status", authenticateToken, requireRole("admin"), updateSubcategoryStatus);
router.delete("/subcategories/:id", authenticateToken, requireRole("admin"), deleteSubcategory);

export default router;
