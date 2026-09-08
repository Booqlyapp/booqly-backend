"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        "Users",
        "passwordResetOtp",
        {
          type: Sequelize.STRING,
          allowNull: true,
        },
        { transaction }
      );

      await queryInterface.addColumn(
        "Users",
        "passwordResetOtpExpiresAt",
        {
          type: Sequelize.DATE,
          allowNull: true,
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
      await queryInterface.removeColumn("Users", "passwordResetOtpExpiresAt", { transaction });
      await queryInterface.removeColumn("Users", "passwordResetOtp", { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
