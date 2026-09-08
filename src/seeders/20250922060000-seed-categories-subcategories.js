"use strict";

const { v4: uuidv4 } = require("uuid");

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Define categories and their subcategories
      const categoriesData = [
        {
          name: "Hair",
          subcategories: [
            "Braids",
            "Silk Press",
            "Coloring",
            "Locs / Retwists",
            "Blowouts",
            "Weaves & Extensions",
            "Wig Install",
            "Quick Weave",
            "Ponytails",
            "Cuts & Styling",
            "Barbering"
          ]
        },
        {
          name: "Makeup",
          subcategories: [
            "Soft Glam",
            "Full Glam",
            "Bridal Makeup",
            "Editorial Looks",
            "Natural/No-Makeup Look"
          ]
        },
        {
          name: "Nails",
          subcategories: [
            "Acrylics",
            "Gel Manicures",
            "Nail Art",
            "Press-ons",
            "Pedicures"
          ]
        },
        {
          name: "Lashes & Brows",
          subcategories: [
            "Lash Extensions",
            "Lash Lifts",
            "Brow Shaping",
            "Microblading",
            "Tinting"
          ]
        },
        {
          name: "Skincare",
          subcategories: [
            "Facials",
            "Dermaplaning",
            "Microneedling",
            "Waxing (Face/Body)",
            "Chemical Peels"
          ]
        },
        {
          name: "Waxing & Hair Removal",
          subcategories: [
            "Full Body Wax",
            "Brazilian Wax",
            "Underarms / Legs / Arms",
            "Sugaring"
          ]
        },
        {
          name: "Barber Services",
          subcategories: [
            "Fades & Shape-Ups",
            "Beard Trims",
            "Hot Towel Shaves",
            "Scalp Treatments",
            "Braids"
          ]
        },
        {
          name: "Aesthetics & Injectables",
          subcategories: [
            "Anti-Wrinkle / Neurotoxins",
            "Dermal Fillers",
            "Skin & Collagen Boosters",
            "Fat Dissolving / Sculpting",
            "IV Therapy & Wellness Shots",
            "Advanced Aesthetics"
          ]
        }
      ];

      // Insert categories and collect their IDs
      const categories = [];
      let sortOrder = 1;

      for (const categoryData of categoriesData) {
        const categoryId = uuidv4();
        const category = {
          id: categoryId,
          name: categoryData.name,
          description: `${categoryData.name} services and treatments`,
          isActive: true,
          sortOrder: sortOrder++,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        categories.push(category);
      }

      // Insert all categories
      await queryInterface.bulkInsert("Categories", categories, { transaction });

      // Insert subcategories
      const subcategories = [];
      let subcategorySortOrder = 1;

      for (let i = 0; i < categoriesData.length; i++) {
        const categoryData = categoriesData[i];
        const category = categories[i];

        for (const subcategoryName of categoryData.subcategories) {
          const subcategory = {
            id: uuidv4(),
            name: subcategoryName,
            description: `${subcategoryName} services`,
            categoryId: category.id,
            isActive: true,
            sortOrder: subcategorySortOrder++,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          subcategories.push(subcategory);
        }
        // Reset sort order for each category
        subcategorySortOrder = 1;
      }

      // Insert all subcategories
      await queryInterface.bulkInsert("Subcategories", subcategories, { transaction });

      await transaction.commit();
      console.log("Categories and subcategories seeded successfully!");
    } catch (error) {
      await transaction.rollback();
      console.error("Error seeding categories and subcategories:", error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Delete subcategories first due to foreign key constraints
      await queryInterface.bulkDelete("Subcategories", null, { transaction });
      
      // Then delete categories
      await queryInterface.bulkDelete("Categories", null, { transaction });

      await transaction.commit();
      console.log("Categories and subcategories removed successfully!");
    } catch (error) {
      await transaction.rollback();
      console.error("Error removing categories and subcategories:", error);
      throw error;
    }
  },
};
