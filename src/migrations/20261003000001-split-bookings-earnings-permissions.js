"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("TeamMemberPermissions", "viewTotalBookings", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("TeamMemberPermissions", "viewLimitedBookings", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("TeamMemberPermissions", "viewTotalEarnings", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn("TeamMemberPermissions", "viewLimitedEarnings", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // Previous unified toggle meant full suite-wide access.
    await queryInterface.sequelize.query(`
      UPDATE "TeamMemberPermissions"
      SET
        "viewTotalBookings" = TRUE,
        "viewTotalEarnings" = TRUE
      WHERE "viewBookings" = TRUE
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("TeamMemberPermissions", "viewTotalBookings");
    await queryInterface.removeColumn("TeamMemberPermissions", "viewLimitedBookings");
    await queryInterface.removeColumn("TeamMemberPermissions", "viewTotalEarnings");
    await queryInterface.removeColumn("TeamMemberPermissions", "viewLimitedEarnings");
  },
};
