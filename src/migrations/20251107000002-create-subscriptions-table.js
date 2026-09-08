"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        "Subscriptions",
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
            allowNull: false,
          },
          userId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "Users",
              key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          planType: {
            type: Sequelize.ENUM(
              "client_free",
              "client_referral",
              "client_premium",
              "solo_basic",
              "solo_pro",
              "solo_premium",
              "suite_starter",
              "suite_growing",
              "suite_pro",
              "suite_elite"
            ),
            allowNull: false,
          },
          stripeSubscriptionId: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          status: {
            type: Sequelize.ENUM("active", "canceled", "past_due", "unpaid", "trialing", "incomplete", "incomplete_expired", "paused"),
            allowNull: false,
            defaultValue: "active",
          },
          currentPeriodStart: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          currentPeriodEnd: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          trialEnd: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          cancelAtPeriodEnd: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          metadata: {
            type: Sequelize.JSONB,
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
      await queryInterface.addIndex("Subscriptions", ["userId"], { transaction });
      await queryInterface.addIndex("Subscriptions", ["stripeSubscriptionId"], { transaction });
      await queryInterface.addIndex("Subscriptions", ["status"], { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable("Subscriptions", { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
