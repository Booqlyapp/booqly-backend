"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // Postgres requires ALTER TYPE ... ADD VALUE to run outside a transaction block.
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_Users_role" ADD VALUE IF NOT EXISTS 'admin';`
    );
  },

  async down() {
    // Postgres does not support removing a value from an enum type directly;
    // reverting would require recreating the type and is intentionally left as a no-op.
  },
};
