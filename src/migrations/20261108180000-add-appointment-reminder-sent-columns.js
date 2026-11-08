"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE "Appointments"
      ADD COLUMN IF NOT EXISTS "reminder24hSentAt" TIMESTAMP WITH TIME ZONE NULL;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "Appointments"
      ADD COLUMN IF NOT EXISTS "reminder1hSentAt" TIMESTAMP WITH TIME ZONE NULL;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "ExternalAppointments"
      ADD COLUMN IF NOT EXISTS "reminder24hSentAt" TIMESTAMP WITH TIME ZONE NULL;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "ExternalAppointments"
      ADD COLUMN IF NOT EXISTS "reminder1hSentAt" TIMESTAMP WITH TIME ZONE NULL;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE "Appointments" DROP COLUMN IF EXISTS "reminder24hSentAt";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "Appointments" DROP COLUMN IF EXISTS "reminder1hSentAt";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "ExternalAppointments" DROP COLUMN IF EXISTS "reminder24hSentAt";
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "ExternalAppointments" DROP COLUMN IF EXISTS "reminder1hSentAt";
    `);
  },
};
