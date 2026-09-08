"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_Messages_messageType"
      ADD VALUE IF NOT EXISTS 'reel';
    `);
  },

  async down() {
    // PostgreSQL does not support removing individual enum values safely.
  },
};
