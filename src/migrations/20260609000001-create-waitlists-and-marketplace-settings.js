"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        "Marketplaces",
        "waitlistEnabled",
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction }
      );

      await queryInterface.addColumn(
        "Marketplaces",
        "waitlistClaimWindowMinutes",
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 15,
        },
        { transaction }
      );

      await queryInterface.createTable(
        "Waitlists",
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
            allowNull: false,
          },
          marketplaceId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "Marketplaces",
              key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          clientUserId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "Users",
              key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          dateTime: {
            type: Sequelize.DATE,
            allowNull: false,
          },
          note: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          status: {
            type: Sequelize.ENUM("waiting", "notified", "claimed", "filled", "expired", "cancelled"),
            allowNull: false,
            defaultValue: "waiting",
          },
          notifiedAt: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          claimExpiresAt: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          claimedAt: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          fulfilledAppointmentId: {
            type: Sequelize.UUID,
            allowNull: true,
            references: {
              model: "Appointments",
              key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
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

      await queryInterface.addIndex("Waitlists", ["marketplaceId"], { transaction });
      await queryInterface.addIndex("Waitlists", ["clientUserId"], { transaction });
      await queryInterface.addIndex("Waitlists", ["dateTime"], { transaction });
      await queryInterface.addIndex("Waitlists", ["status"], { transaction });
      await queryInterface.addIndex("Waitlists", ["marketplaceId", "dateTime", "status"], { transaction });

      await queryInterface.addIndex(
        "Waitlists",
        ["marketplaceId", "clientUserId", "dateTime"],
        {
          unique: true,
          where: {
            status: ["waiting", "notified", "claimed"],
          },
          name: "waitlists_active_unique_idx",
          transaction,
        }
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
      await queryInterface.removeIndex("Waitlists", "waitlists_active_unique_idx", { transaction });
      await queryInterface.dropTable("Waitlists", { transaction });
      await queryInterface.removeColumn("Marketplaces", "waitlistClaimWindowMinutes", { transaction });
      await queryInterface.removeColumn("Marketplaces", "waitlistEnabled", { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
