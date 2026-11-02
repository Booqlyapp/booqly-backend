"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Appointments", "clientNoPreference", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn("ExternalAppointments", "clientNoPreference", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("ExternalAppointments", "clientNoPreference");
    await queryInterface.removeColumn("Appointments", "clientNoPreference");
  },
};
