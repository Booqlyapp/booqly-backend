"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        "ReferralInvites",
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
          referralCode: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          providerName: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          providerBusinessName: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          benefits: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          status: {
            type: Sequelize.ENUM("pending", "applied", "expired"),
            allowNull: false,
            defaultValue: "pending",
          },
          sentAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
          },
          appliedAt: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          expiresAt: {
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
      await queryInterface.addIndex("ReferralInvites", ["providerId"], { transaction });
      await queryInterface.addIndex("ReferralInvites", ["clientId"], { transaction });
      await queryInterface.addIndex("ReferralInvites", ["status"], { transaction });
      await queryInterface.addIndex("ReferralInvites", ["referralCode"], { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable("ReferralInvites", { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
