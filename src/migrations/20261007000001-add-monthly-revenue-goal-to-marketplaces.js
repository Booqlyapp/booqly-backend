"use strict";

/** PRD Suite Owner: Total suite revenue and monthly revenue goals */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Marketplaces", "monthlyRevenueGoal", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Marketplaces", "monthlyRevenueGoal");
  },
};
