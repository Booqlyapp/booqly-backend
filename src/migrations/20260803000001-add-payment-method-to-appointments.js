"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        "Appointments",
        "paymentMethod",
        {
          type: Sequelize.ENUM("apple_pay", "stripe_card", "paypal", "cash", "other"),
          allowNull: true,
        },
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.removeColumn("Appointments", "paymentMethod", { transaction });
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_Appointments_paymentMethod";',
        { transaction }
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
