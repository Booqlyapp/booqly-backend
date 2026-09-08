"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        "Users",
        "stripeConnectAccountId",
        {
          type: Sequelize.STRING,
          allowNull: true,
        },
        { transaction }
      );

      await queryInterface.addColumn(
        "Users",
        "stripeConnectChargesEnabled",
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction }
      );

      await queryInterface.addColumn(
        "Users",
        "stripeConnectPayoutsEnabled",
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction }
      );

      await queryInterface.addColumn(
        "Users",
        "stripeConnectDetailsSubmitted",
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.removeColumn("Users", "stripeConnectDetailsSubmitted", { transaction });
      await queryInterface.removeColumn("Users", "stripeConnectPayoutsEnabled", { transaction });
      await queryInterface.removeColumn("Users", "stripeConnectChargesEnabled", { transaction });
      await queryInterface.removeColumn("Users", "stripeConnectAccountId", { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
