"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Create the "Services" table with marketplaceId foreign key
      await queryInterface.createTable(
        "Services",
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.UUIDV4,
          },
          name: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          category: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          subcategory: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          categoryId: {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
              model: "Categories",
              key: "id",
            },
            onDelete: "SET NULL",
            onUpdate: "CASCADE",
          },
          subcategoryId: {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
              model: "Subcategories",
              key: "id",
            },
            onDelete: "SET NULL",
            onUpdate: "CASCADE",
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          price: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
          },
          duration: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          marketplaceId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "Marketplaces",
              key: "id",
            },
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
          },
          isActive: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
          },
          requireDeposit: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          depositType: {
            type: Sequelize.ENUM('fixed', 'percentage'),
            allowNull: true,
          },
          depositAmount: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
          },
          imageUrl: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
          },
          deletedAt: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: null,
          },
        },
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Drop the "Services" table
      await queryInterface.dropTable("Services", { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
