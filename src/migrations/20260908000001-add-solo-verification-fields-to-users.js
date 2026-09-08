"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        "Users",
        "identityVerified",
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction }
      );

      await queryInterface.addColumn(
        "Users",
        "professionalVerified",
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction }
      );

      await queryInterface.addColumn(
        "Users",
        "businessVerified",
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction }
      );

      await queryInterface.addColumn(
        "Users",
        "professionalLicenseType",
        {
          type: Sequelize.STRING,
          allowNull: true,
        },
        { transaction }
      );

      await queryInterface.addColumn(
        "Users",
        "professionalDocumentUrl",
        {
          type: Sequelize.STRING,
          allowNull: true,
        },
        { transaction }
      );

      await queryInterface.addColumn(
        "Users",
        "businessDocumentUrl",
        {
          type: Sequelize.STRING,
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

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.removeColumn("Users", "identityVerified", { transaction });
      await queryInterface.removeColumn("Users", "professionalVerified", { transaction });
      await queryInterface.removeColumn("Users", "businessVerified", { transaction });
      await queryInterface.removeColumn("Users", "professionalLicenseType", { transaction });
      await queryInterface.removeColumn("Users", "professionalDocumentUrl", { transaction });
      await queryInterface.removeColumn("Users", "businessDocumentUrl", { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};