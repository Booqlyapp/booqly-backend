"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Create the "Socials" table with marketplaceId foreign key
      await queryInterface.createTable(
        "Socials",
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.UUIDV4,
          },
          insta: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          tiktok: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          facebook: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          googlePlaceId: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          marketplaceId: {
            // Foreign key to Marketplaces
            type: Sequelize.UUID,
            allowNull: true,
            references: {
              model: "Marketplaces",
              key: "id",
            },
            onDelete: "CASCADE",
            onUpdate: "CASCADE",
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

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Drop the "Socials" table
      await queryInterface.dropTable("Socials", { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
