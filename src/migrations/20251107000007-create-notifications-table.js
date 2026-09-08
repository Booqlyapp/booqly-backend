"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        "Notifications",
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
            allowNull: false,
          },
          userId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "Users",
              key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          type: {
            type: Sequelize.ENUM(
              "booking_confirmation",
              "booking_reminder",
              "message",
              "review",
              "payment",
              "subscription"
            ),
            allowNull: false,
          },
          title: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          content: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          data: {
            type: Sequelize.JSONB,
            allowNull: true,
          },
          channels: {
            type: Sequelize.JSONB,
            allowNull: false,
            defaultValue: {
              push: true,
              sms: false,
              email: false,
              in_app: true,
            },
          },
          isRead: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          sentAt: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
          },
        },
        { transaction }
      );

      // Add indexes
      await queryInterface.addIndex("Notifications", ["userId"], { transaction });
      await queryInterface.addIndex("Notifications", ["type"], { transaction });
      await queryInterface.addIndex("Notifications", ["isRead"], { transaction });
      await queryInterface.addIndex("Notifications", ["createdAt"], { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable("Notifications", { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
