"use strict";

/** Suite revenue goal sheet: split-by-member + progress alert preferences */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Marketplaces", "splitRevenueGoalByMember", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("Marketplaces", "revenueGoalProgressAlerts", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Marketplaces", "revenueGoalProgressAlerts");
    await queryInterface.removeColumn("Marketplaces", "splitRevenueGoalByMember");
  },
};
