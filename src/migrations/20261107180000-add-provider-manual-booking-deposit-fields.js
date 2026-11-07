"use strict";

/** Provider/owner manual booking: pending deposit hold + waive flag. */
module.exports = {
  async up(queryInterface) {
    // Enum values must run outside a transaction on Postgres.
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_Appointments_status" ADD VALUE IF NOT EXISTS 'pending_deposit';
    `);
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_Appointments_status" ADD VALUE IF NOT EXISTS 'confirmed';
    `);
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_Appointments_status" ADD VALUE IF NOT EXISTS 'deposit_expired';
    `);

    const table = await queryInterface.describeTable("Appointments");
    if (!table.depositExpiresAt) {
      await queryInterface.addColumn("Appointments", "depositExpiresAt", {
        type: require("sequelize").DATE,
        allowNull: true,
      });
    }
    if (!table.depositWaived) {
      await queryInterface.addColumn("Appointments", "depositWaived", {
        type: require("sequelize").BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Appointments", "depositExpiresAt");
    await queryInterface.removeColumn("Appointments", "depositWaived");
    // Enum values are not removed on Postgres.
  },
};
