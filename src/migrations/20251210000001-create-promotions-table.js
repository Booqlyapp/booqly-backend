"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Promotions", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      providerId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      discountType: {
        type: Sequelize.ENUM("percentage", "fixed"),
        allowNull: false,
      },
      discountValue: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      minOrderAmount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      maxDiscountAmount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      categoryId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "Categories",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      subcategoryId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "Subcategories",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      serviceIds: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: true,
      },
      usageLimit: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      usedCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      startDate: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      endDate: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    // Add indexes
    await queryInterface.addIndex("Promotions", ["providerId"]);
    await queryInterface.addIndex("Promotions", ["categoryId"]);
    await queryInterface.addIndex("Promotions", ["subcategoryId"]);
    await queryInterface.addIndex("Promotions", ["startDate", "endDate"]);
    await queryInterface.addIndex("Promotions", ["isActive"]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("Promotions");
  },
};
