"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        "Reviews",
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
            allowNull: false,
          },
          clientId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "Users",
              key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
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
          appointmentId: {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
              model: "Appointments",
              key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
          },
          rating: {
            type: Sequelize.INTEGER,
            allowNull: false,
            validate: {
              min: 0,
              max: 5,
            },
          },
          comment: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          type: {
            type: Sequelize.ENUM("verified", "semi_verified"),
            allowNull: false,
          },
          proofDocument: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          status: {
            type: Sequelize.ENUM("pending", "approved", "rejected"),
            allowNull: false,
            defaultValue: "pending",
          },
          isPublic: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
          },
          providerResponse: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          respondedAt: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          providerRating: {
            type: Sequelize.INTEGER,
            allowNull: true,
            validate: {
              min: 1,
              max: 5,
            },
          },
          clientPrompted: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          providerPrompted: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          clientPromptedAt: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          providerPromptedAt: {
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

      // Add indexes
      await queryInterface.addIndex("Reviews", ["clientId"], { transaction });
      await queryInterface.addIndex("Reviews", ["providerId"], { transaction });
      await queryInterface.addIndex("Reviews", ["appointmentId"], { transaction });
      await queryInterface.addIndex("Reviews", ["status"], { transaction });
      await queryInterface.addIndex("Reviews", ["rating"], { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable("Reviews", { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
