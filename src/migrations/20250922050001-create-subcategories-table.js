"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Create the "Subcategories" table
      await queryInterface.createTable(
        "Subcategories",
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
          description: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          categoryId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "Categories",
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
          sortOrder: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
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

      // Add unique constraint for name within category
      await queryInterface.addIndex(
        "Subcategories",
        ["categoryId", "name"],
        {
          unique: true,
          name: "unique_subcategory_per_category",
          transaction,
        }
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
      // Drop the "Subcategories" table
      await queryInterface.dropTable("Subcategories", { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
