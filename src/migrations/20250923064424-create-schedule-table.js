"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Create the "Schedules" table
      await queryInterface.createTable(
        "Schedules",
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.UUIDV4, // Added default value to generate UUID
          },
          monday: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          tuesday: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          wednesday: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          thursday: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          friday: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          saturday: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          sunday: {
            type: Sequelize.STRING,
            allowNull: false,
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

      // Add "scheduleId" to "Marketplaces" table as a foreign key reference
      await queryInterface.addColumn(
        "Marketplaces",
        "scheduleId",
        {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: "Schedules", // Reference to the "Schedules" table
            key: "id", // The key to use from the referenced table
          },
          onDelete: "CASCADE", // Ensures that the schedule is deleted when the marketplace is deleted
          onUpdate: "CASCADE", // Ensures that the reference is updated if the schedule ID changes
        },
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      // If an error occurs, rollback the transaction
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Remove the "scheduleId" foreign key column from "Marketplaces" table
      await queryInterface.removeColumn("Marketplaces", "scheduleId", {
        transaction,
      });

      // Drop the "Schedules" table
      await queryInterface.dropTable("Schedules", { transaction });

      await transaction.commit();
    } catch (error) {
      // If an error occurs, rollback the transaction
      await transaction.rollback();
      throw error;
    }
  },
};
