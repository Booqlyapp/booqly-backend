"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Create the "Appointments" table with foreign keys
      await queryInterface.createTable(
        "Appointments",
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.UUIDV4,
          },
          userId: {
            // Foreign key to Users
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "Users",
              key: "id",
            },
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
          },
          marketplaceId: {
            // Foreign key to Marketplaces
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "Marketplaces",
              key: "id",
            },
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
          },
          serviceId: {
            // Foreign key to Services
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "Services",
              key: "id",
            },
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
          },
          paymentStatus: {
            type: Sequelize.ENUM("pending", "paid", "failed", "refunded", "partially_paid"),
            allowNull: false,
            defaultValue: "pending",
          },
          status: {
            type: Sequelize.ENUM("pending", "canceled", "postponed", "availed", "no_show"),
            allowNull: false,
            defaultValue: "pending",
          },
          dateTime: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          price: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
          },
          depositAmount: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
          },
          remainingBalance: {
            type: Sequelize.DECIMAL(10, 2),
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
      // Drop the "Appointments" table
      await queryInterface.dropTable("Appointments", { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
