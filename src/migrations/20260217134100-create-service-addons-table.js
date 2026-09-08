"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Create the "ServiceAddOns" table
      await queryInterface.createTable(
        "ServiceAddOns",
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.UUIDV4,
          },
          serviceId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "Services",
              key: "id",
            },
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
          },
          title: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          price: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
          },
          isActive: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
          },
          deletedAt: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: null,
          },
        },
        { transaction }
      );

      // Add index for serviceId for better query performance
      await queryInterface.addIndex("ServiceAddOns", ["serviceId"], {
        transaction,
        name: "idx_service_addons_service_id",
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Drop the "ServiceAddOns" table
      await queryInterface.dropTable("ServiceAddOns", { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
