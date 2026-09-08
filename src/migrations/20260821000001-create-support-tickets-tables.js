"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const [rows] = await queryInterface.sequelize.query(
        `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'SupportTickets'
        ) AS "exists";
        `,
        { transaction }
      );

      if (!rows?.[0]?.exists) {
        await queryInterface.createTable(
          "SupportTickets",
          {
            id: {
              type: Sequelize.UUID,
              defaultValue: Sequelize.UUIDV4,
              primaryKey: true,
              allowNull: false,
            },
            ticketNumber: {
              type: Sequelize.STRING(20),
              allowNull: false,
              unique: true,
            },
            userId: {
              type: Sequelize.UUID,
              allowNull: false,
              references: { model: "Users", key: "id" },
              onUpdate: "CASCADE",
              onDelete: "CASCADE",
            },
            createdById: {
              type: Sequelize.UUID,
              allowNull: false,
              references: { model: "Users", key: "id" },
              onUpdate: "CASCADE",
              onDelete: "CASCADE",
            },
            category: {
              type: Sequelize.ENUM(
                "billing",
                "app_issue",
                "verification",
                "account",
                "payment"
              ),
              allowNull: false,
            },
            subject: {
              type: Sequelize.STRING(100),
              allowNull: false,
            },
            description: {
              type: Sequelize.STRING(1000),
              allowNull: false,
            },
            status: {
              type: Sequelize.ENUM("open", "in_progress", "resolved", "closed"),
              allowNull: false,
              defaultValue: "open",
            },
            priority: {
              type: Sequelize.ENUM("low", "medium", "high"),
              allowNull: false,
              defaultValue: "medium",
            },
            assignedToId: {
              type: Sequelize.UUID,
              allowNull: true,
              references: { model: "Users", key: "id" },
              onUpdate: "CASCADE",
              onDelete: "SET NULL",
            },
            attachments: {
              type: Sequelize.JSONB,
              allowNull: true,
              defaultValue: [],
            },
            firstResponseAt: {
              type: Sequelize.DATE,
              allowNull: true,
            },
            resolvedAt: {
              type: Sequelize.DATE,
              allowNull: true,
            },
            closedAt: {
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

        await queryInterface.addIndex("SupportTickets", ["status"], { transaction });
        await queryInterface.addIndex("SupportTickets", ["category"], { transaction });
        await queryInterface.addIndex("SupportTickets", ["priority"], { transaction });
        await queryInterface.addIndex("SupportTickets", ["userId"], { transaction });
        await queryInterface.addIndex("SupportTickets", ["assignedToId"], { transaction });
        await queryInterface.addIndex("SupportTickets", ["ticketNumber"], {
          unique: true,
          transaction,
        });
      }

      const [msgRows] = await queryInterface.sequelize.query(
        `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'SupportTicketMessages'
        ) AS "exists";
        `,
        { transaction }
      );

      if (!msgRows?.[0]?.exists) {
        await queryInterface.createTable(
          "SupportTicketMessages",
          {
            id: {
              type: Sequelize.UUID,
              defaultValue: Sequelize.UUIDV4,
              primaryKey: true,
              allowNull: false,
            },
            ticketId: {
              type: Sequelize.UUID,
              allowNull: false,
              references: { model: "SupportTickets", key: "id" },
              onUpdate: "CASCADE",
              onDelete: "CASCADE",
            },
            senderId: {
              type: Sequelize.UUID,
              allowNull: false,
              references: { model: "Users", key: "id" },
              onUpdate: "CASCADE",
              onDelete: "CASCADE",
            },
            message: {
              type: Sequelize.TEXT,
              allowNull: false,
            },
            attachments: {
              type: Sequelize.JSONB,
              allowNull: true,
              defaultValue: [],
            },
            isInternal: {
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
          },
          { transaction }
        );

        await queryInterface.addIndex("SupportTicketMessages", ["ticketId"], {
          transaction,
        });
        await queryInterface.addIndex("SupportTicketMessages", ["senderId"], {
          transaction,
        });
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable("SupportTicketMessages", { transaction });
      await queryInterface.dropTable("SupportTickets", { transaction });
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_SupportTickets_category";',
        { transaction }
      );
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_SupportTickets_status";',
        { transaction }
      );
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_SupportTickets_priority";',
        { transaction }
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
