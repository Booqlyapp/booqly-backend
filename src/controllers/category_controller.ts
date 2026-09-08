import { Request, Response } from "express";
import { Category, Subcategory } from "../models";
import { Service } from "../models/service_model";
import { Op } from "sequelize";


// Get all categories with their subcategories
export const getCategories = async (req: Request, res: Response) => {
  try {
    const { includeInactive } = req.query;
    
    const whereClause = includeInactive === 'true' ? {} : { isActive: true };
    
    const categories = await Category.findAll({
      where: whereClause,
      include: [
        {
          model: Subcategory,
          as: "subcategories",
          where: includeInactive === 'true' ? {} : { isActive: true },
          required: false,
        },
      ],
      order: [
        ["sortOrder", "ASC"],
        [{ model: Subcategory, as: "subcategories" }, "sortOrder", "ASC"],
      ],
    });

    res.status(200).json({
      status: true,
      message: "Categories retrieved successfully",
      data: categories,
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get category by ID with subcategories
export const getCategoryById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { includeInactive } = req.query;
    
    const whereClause = includeInactive === 'true' ? {} : { isActive: true };

    const category = await Category.findOne({
      where: { id, ...whereClause },
      include: [
        {
          model: Subcategory,
          as: "subcategories",
          where: includeInactive === 'true' ? {} : { isActive: true },
          required: false,
        },
      ],
      order: [[{ model: Subcategory, as: "subcategories" }, "sortOrder", "ASC"]],
    });

    if (!category) {
      return res.status(404).json({
        status: false,
        message: "Category not found",
      });
    }

    res.status(200).json({
      status: true,
      message: "Category retrieved successfully",
      data: category,
    });
  } catch (error) {
    console.error("Error fetching category:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get subcategories by category ID
export const getSubcategoriesByCategory = async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;
    const { includeInactive } = req.query;
    
    const whereClause = includeInactive === 'true' ? { categoryId } : { categoryId, isActive: true };

    const subcategories = await Subcategory.findAll({
      where: whereClause,
      include: [
        {
          model: Category,
          as: "category",
          attributes: ["id", "name"],
        },
      ],
      order: [["sortOrder", "ASC"]],
    });

    res.status(200).json({
      status: true,
      message: "Subcategories retrieved successfully",
      data: subcategories,
    });
  } catch (error) {
    console.error("Error fetching subcategories:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Search categories and subcategories
export const searchCategories = async (req: Request, res: Response) => {
  try {
    const { query, includeInactive } = req.query;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        status: false,
        message: "Search query is required",
      });
    }

    const whereClause = includeInactive === 'true' ? {} : { isActive: true };
    const searchPattern = `%${query}%`;

    const categories = await Category.findAll({
      where: {
        ...whereClause,
        name: {
          [Op.iLike]: searchPattern,
        },
      },
      include: [
        {
          model: Subcategory,
          as: "subcategories",
          where: includeInactive === 'true' ? {} : { isActive: true },
          required: false,
        },
      ],
      order: [
        ["sortOrder", "ASC"],
        [{ model: Subcategory, as: "subcategories" }, "sortOrder", "ASC"],
      ],
    });

    // Also search subcategories
    const subcategories = await Subcategory.findAll({
      where: {
        ...whereClause,
        name: {
          [Op.iLike]: searchPattern,
        },
      },
      include: [
        {
          model: Category,
          as: "category",
          where: includeInactive === 'true' ? {} : { isActive: true },
          required: true,
        },
      ],
      order: [["sortOrder", "ASC"]],
    });

    res.status(200).json({
      status: true,
      message: "Search results retrieved successfully",
      data: {
        categories,
        subcategories,
      },
    });
  } catch (error) {
    console.error("Error searching categories:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Create new category (Admin only)
export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, description, sortOrder } = req.body;

    if (!name) {
      return res.status(400).json({
        status: false,
        message: "Category name is required",
      });
    }

    // Check if category already exists
    const existingCategory = await Category.findOne({
      where: { name },
    });

    if (existingCategory) {
      return res.status(409).json({
        status: false,
        message: "Category with this name already exists",
      });
    }

    const category = await Category.create({
      name,
      description,
      sortOrder: sortOrder || 0,
      isActive: true,
    });

    res.status(201).json({
      status: true,
      message: "Category created successfully",
      data: category,
    });
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Create new subcategory (Admin only or user-generated custom subcategory)
export const createSubcategory = async (req: Request, res: Response) => {
  try {
    const { name, description, categoryId, sortOrder, isCustom } = req.body;

    if (!name || !categoryId) {
      return res.status(400).json({
        status: false,
        message: "Subcategory name and category ID are required",
      });
    }

    // Check if category exists
    const category = await Category.findByPk(categoryId);
    if (!category) {
      return res.status(404).json({
        status: false,
        message: "Category not found",
      });
    }

    // Check if subcategory already exists in this category
    const existingSubcategory = await Subcategory.findOne({
      where: { name: name.trim(), categoryId },
    });

    if (existingSubcategory) {
      // If subcategory exists, return it instead of creating duplicate
      return res.status(200).json({
        status: true,
        message: "Subcategory already exists",
        data: existingSubcategory,
      });
    }

    // Get the highest sort order for this category to append new custom subcategories at the end
    const maxSortOrder = await Subcategory.max('sortOrder', {
      where: { categoryId }
    }) as number || 0;

    const subcategory = await Subcategory.create({
      name: name.trim(),
      description: description || `${name.trim()} services`,
      categoryId,
      sortOrder: sortOrder || (maxSortOrder + 1),
      isActive: true,
    });

    res.status(201).json({
      status: true,
      message: "Subcategory created successfully",
      data: subcategory,
    });
  } catch (error) {
    console.error("Error creating subcategory:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Update category (Admin only)
export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, sortOrder } = req.body;

    const category = await Category.findByPk(id);
    if (!category) {
      return res.status(404).json({
        status: false,
        message: "Category not found",
      });
    }

    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({ where: { name } });
      if (existingCategory) {
        return res.status(409).json({
          status: false,
          message: "Category with this name already exists",
        });
      }
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    await category.update(updates);

    res.status(200).json({
      status: true,
      message: "Category updated successfully",
      data: category,
    });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Activate or deactivate a category (Admin only)
export const updateCategoryStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        status: false,
        message: "isActive (boolean) is required",
      });
    }

    const category = await Category.findByPk(id);
    if (!category) {
      return res.status(404).json({
        status: false,
        message: "Category not found",
      });
    }

    await category.update({ isActive });

    res.status(200).json({
      status: true,
      message: `Category ${isActive ? "activated" : "deactivated"} successfully`,
      data: category,
    });
  } catch (error) {
    console.error("Error updating category status:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Delete category (Admin only). Soft-deletes by default; pass ?force=true to permanently delete.
export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const force = req.query.force === "true";

    const category = await Category.findByPk(id);
    if (!category) {
      return res.status(404).json({
        status: false,
        message: "Category not found",
      });
    }

    const serviceCount = await Service.count({ where: { categoryId: id } });
    if (serviceCount > 0) {
      return res.status(409).json({
        status: false,
        message: `Cannot delete category: ${serviceCount} service(s) are using it. Reassign or remove them first.`,
      });
    }

    await category.destroy({ force });

    res.status(200).json({
      status: true,
      message: force ? "Category permanently deleted" : "Category deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Update subcategory (Admin only)
export const updateSubcategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, sortOrder, categoryId } = req.body;

    const subcategory = await Subcategory.findByPk(id);
    if (!subcategory) {
      return res.status(404).json({
        status: false,
        message: "Subcategory not found",
      });
    }

    if (categoryId && categoryId !== subcategory.categoryId) {
      const category = await Category.findByPk(categoryId);
      if (!category) {
        return res.status(404).json({
          status: false,
          message: "Category not found",
        });
      }
    }

    const targetCategoryId = categoryId ?? subcategory.categoryId;
    const targetName = name !== undefined ? name.trim() : subcategory.name;

    if (targetName !== subcategory.name || targetCategoryId !== subcategory.categoryId) {
      const existingSubcategory = await Subcategory.findOne({
        where: { name: targetName, categoryId: targetCategoryId },
      });
      if (existingSubcategory && existingSubcategory.id !== id) {
        return res.status(409).json({
          status: false,
          message: "Subcategory with this name already exists in this category",
        });
      }
    }

    const updates: any = {};
    if (name !== undefined) updates.name = targetName;
    if (description !== undefined) updates.description = description;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (categoryId !== undefined) updates.categoryId = categoryId;

    await subcategory.update(updates);

    res.status(200).json({
      status: true,
      message: "Subcategory updated successfully",
      data: subcategory,
    });
  } catch (error) {
    console.error("Error updating subcategory:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Activate or deactivate a subcategory (Admin only)
export const updateSubcategoryStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        status: false,
        message: "isActive (boolean) is required",
      });
    }

    const subcategory = await Subcategory.findByPk(id);
    if (!subcategory) {
      return res.status(404).json({
        status: false,
        message: "Subcategory not found",
      });
    }

    await subcategory.update({ isActive });

    res.status(200).json({
      status: true,
      message: `Subcategory ${isActive ? "activated" : "deactivated"} successfully`,
      data: subcategory,
    });
  } catch (error) {
    console.error("Error updating subcategory status:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Delete subcategory (Admin only). Soft-deletes by default; pass ?force=true to permanently delete.
export const deleteSubcategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const force = req.query.force === "true";

    const subcategory = await Subcategory.findByPk(id);
    if (!subcategory) {
      return res.status(404).json({
        status: false,
        message: "Subcategory not found",
      });
    }

    const serviceCount = await Service.count({ where: { subcategoryId: id } });
    if (serviceCount > 0) {
      return res.status(409).json({
        status: false,
        message: `Cannot delete subcategory: ${serviceCount} service(s) are using it. Reassign or remove them first.`,
      });
    }

    await subcategory.destroy({ force });

    res.status(200).json({
      status: true,
      message: force ? "Subcategory permanently deleted" : "Subcategory deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting subcategory:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Get category & subcategory statistics: total, active, inactive counts (Admin only)
export const getCategoryStats = async (req: Request, res: Response) => {
  try {
    const [totalCategories, activeCategories, totalSubcategories, activeSubcategories] =
      await Promise.all([
        Category.count(),
        Category.count({ where: { isActive: true } }),
        Subcategory.count(),
        Subcategory.count({ where: { isActive: true } }),
      ]);

    res.status(200).json({
      status: true,
      message: "Category statistics retrieved successfully",
      data: {
        categories: {
          total: totalCategories,
          active: activeCategories,
          inactive: totalCategories - activeCategories,
        },
        subcategories: {
          total: totalSubcategories,
          active: activeSubcategories,
          inactive: totalSubcategories - activeSubcategories,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching category statistics:", error);
    res.status(500).json({
      status: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};