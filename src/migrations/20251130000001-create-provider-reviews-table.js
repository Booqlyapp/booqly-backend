"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        "ProviderReviews",
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
            allowNull: false,
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
              min: 1,
              max: 5,
            },
          },
          comment: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          isPublic: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
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
      await queryInterface.addIndex("ProviderReviews", ["providerId"], { transaction });
      await queryInterface.addIndex("ProviderReviews", ["clientId"], { transaction });
      await queryInterface.addIndex("ProviderReviews", ["appointmentId"], { transaction });
      await queryInterface.addIndex("ProviderReviews", ["rating"], { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable("ProviderReviews", { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
