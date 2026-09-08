"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Create the "Marketplaces" table
      await queryInterface.createTable(
        "Marketplaces",
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.UUIDV4,
          },
          businessName: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          phoneNumber: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          businessEmail: {
            type: Sequelize.STRING,
            allowNull: true,
            validate: {
              isEmail: true
            }
          },
          address: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          latitude: {
            type: Sequelize.FLOAT,
            allowNull: true,
          },
          longitude: {
            type: Sequelize.FLOAT,
            allowNull: true,
          },
          imagesList: {
            type: Sequelize.JSONB, // Storing list of images as a JSON array
            allowNull: true,
          },
          portfolioImages: {
            type: Sequelize.JSONB, // Storing portfolio images as a JSON array
            allowNull: true,
          },
          bio: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          policyRules: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          showPolicyRules: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          customLink: {
            type: Sequelize.STRING,
            allowNull: true,
            unique: true,
          },
          bookingPageTitle: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          bookingPageSubtitle: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          bookingPageHeaderImage: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          bookingPageHeaderPdf: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          userId: {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
              model: "Users",
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

      // Add foreign key constraint to existing marketplaceId column in Users table
      await queryInterface.addConstraint("Users", {
        fields: ["marketplaceId"],
        type: "foreign key",
        name: "fk_users_marketplace_id",
        references: {
          table: "Marketplaces",
          field: "id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
        transaction,
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
      // Remove the foreign key constraint from Users table
      await queryInterface.removeConstraint("Users", "fk_users_marketplace_id", {
        transaction,
      });

      // Drop the "Marketplaces" table
      await queryInterface.dropTable("Marketplaces", { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
