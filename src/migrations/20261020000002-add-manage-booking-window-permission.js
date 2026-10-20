"use strict";

/** Team members may edit suite-wide booking window when granted. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      "TeamMemberPermissions",
      "manageBookingWindow",
      {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(
      "TeamMemberPermissions",
      "manageBookingWindow"
    );
  },
};
