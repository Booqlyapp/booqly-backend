"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Services", "providerTeamMemberIds", {
      type: Sequelize.ARRAY(Sequelize.UUID),
      allowNull: false,
      defaultValue: Sequelize.literal("ARRAY[]::UUID[]"),
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Services", "providerTeamMemberIds");
  },
};
