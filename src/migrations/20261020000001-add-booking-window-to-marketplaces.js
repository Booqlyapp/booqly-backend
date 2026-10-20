"use strict";

/** Client booking window: open anytime vs limited from/until dates */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Marketplaces", "bookingWindowLimited", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("Marketplaces", "bookingWindowFrom", {
      type: Sequelize.DATEONLY,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn("Marketplaces", "bookingWindowUntil", {
      type: Sequelize.DATEONLY,
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Marketplaces", "bookingWindowUntil");
    await queryInterface.removeColumn("Marketplaces", "bookingWindowFrom");
    await queryInterface.removeColumn("Marketplaces", "bookingWindowLimited");
  },
};
