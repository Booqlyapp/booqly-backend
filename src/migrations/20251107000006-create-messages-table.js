"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        "Messages",
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
            allowNull: false,
          },
          conversationId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "Conversations",
              key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          senderId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "Users",
              key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          content: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          messageType: {
            type: Sequelize.ENUM("text", "image", "system"),
            allowNull: false,
            defaultValue: "text",
          },
          attachments: {
            type: Sequelize.JSONB,
            allowNull: true,
          },
          isRead: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
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
          },
        },
        { transaction }
      );

      // Add indexes
      await queryInterface.addIndex("Messages", ["conversationId"], { transaction });
      await queryInterface.addIndex("Messages", ["senderId"], { transaction });
      await queryInterface.addIndex("Messages", ["createdAt"], { transaction });
      await queryInterface.addIndex("Messages", ["isRead"], { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable("Messages", { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
