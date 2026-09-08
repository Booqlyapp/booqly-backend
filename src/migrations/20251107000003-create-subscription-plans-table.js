"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        "SubscriptionPlans",
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
            allowNull: false,
          },
          name: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          stripePriceId: {
            type: Sequelize.STRING,
            allowNull: false,
            unique: true,
          },
          userRole: {
            type: Sequelize.ENUM("client", "solo", "suite"),
            allowNull: false,
          },
          price: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
          },
          interval: {
            type: Sequelize.ENUM("month", "year"),
            allowNull: false,
          },
          features: {
            type: Sequelize.JSONB,
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
      await queryInterface.addIndex("SubscriptionPlans", ["userRole"], { transaction });
      await queryInterface.addIndex("SubscriptionPlans", ["stripePriceId"], { transaction });
      await queryInterface.addIndex("SubscriptionPlans", ["isActive"], { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable("SubscriptionPlans", { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
