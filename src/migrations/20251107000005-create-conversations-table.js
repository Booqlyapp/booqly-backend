"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        "Conversations",
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
            allowNull: false,
          },
          clientId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "Users",
              key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          providerId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "Users",
              key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          status: {
            type: Sequelize.ENUM("pending", "active", "blocked"),
            allowNull: false,
            defaultValue: "pending",
          },
          clientMessageCount: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
          },
          providerHasResponded: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          lastMessageAt: {
            type: Sequelize.DATE,
            allowNull: true,
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
        },
        { transaction }
      );

      // Add indexes
      await queryInterface.addIndex("Conversations", ["clientId"], { transaction });
      await queryInterface.addIndex("Conversations", ["providerId"], { transaction });
      await queryInterface.addIndex("Conversations", ["status"], { transaction });
      await queryInterface.addIndex("Conversations", ["lastMessageAt"], { transaction });

      // Add unique constraint for client-provider pair
      await queryInterface.addIndex("Conversations", ["clientId", "providerId"], {
        unique: true,
        transaction,
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable("Conversations", { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
