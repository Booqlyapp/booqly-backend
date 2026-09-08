"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        "ReviewFlags",
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
            allowNull: false,
          },
          reviewId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "Reviews",
              key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          flaggedById: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "Users",
              key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          reviewDirection: {
            type: Sequelize.ENUM("client_to_provider", "provider_to_client"),
            allowNull: false,
          },
          reason: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          status: {
            type: Sequelize.ENUM("pending", "flagged", "approved", "rejected"),
            allowNull: false,
            defaultValue: "pending",
          },
          adminNote: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          resolvedById: {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
              model: "Users",
              key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
          },
          resolvedAt: {
            type: Sequelize.DATE,
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
        },
        { transaction }
      );

      await queryInterface.addIndex("ReviewFlags", ["reviewId"], { transaction });
      await queryInterface.addIndex("ReviewFlags", ["flaggedById"], { transaction });
      await queryInterface.addIndex("ReviewFlags", ["status"], { transaction });
      await queryInterface.addIndex(
        "ReviewFlags",
        ["reviewId", "flaggedById", "reviewDirection"],
        {
          unique: true,
          name: "review_flags_unique_per_user_direction",
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
      await queryInterface.dropTable("ReviewFlags", { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
