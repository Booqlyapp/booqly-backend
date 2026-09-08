"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        ALTER TABLE "Users"
        ADD COLUMN IF NOT EXISTS "isSuspended" BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE "Users"
        ADD COLUMN IF NOT EXISTS "warningCount" INTEGER NOT NULL DEFAULT 0;
        `,
        { transaction }
      );

      const [rows] = await queryInterface.sequelize.query(
        `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'ContentReports'
        ) AS "exists";
        `,
        { transaction }
      );

      if (rows?.[0]?.exists) {
        await transaction.commit();
        return;
      }

      await queryInterface.createTable(
        "ContentReports",
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
            allowNull: false,
          },
          reporterId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "Users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          reportedUserId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "Users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
          },
          originalUserId: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: "Users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
          },
          contentType: {
            type: Sequelize.ENUM("message", "photo", "service_listing", "profile"),
            allowNull: false,
          },
          contentId: {
            type: Sequelize.STRING(1000),
            allowNull: false,
          },
          reason: {
            type: Sequelize.ENUM(
              "inappropriate_content",
              "nudity",
              "misleading_information",
              "impersonation",
              "harassment"
            ),
            allowNull: false,
          },
          details: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          contentPreview: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          contentThumbnailUrl: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          status: {
            type: Sequelize.ENUM("pending", "dismissed", "warned", "suspended"),
            allowNull: false,
            defaultValue: "pending",
          },
          adminNote: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          resolvedById: {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: "Users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
          },
          resolvedAt: {
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

      await queryInterface.addIndex("ContentReports", ["status"], { transaction });
      await queryInterface.addIndex("ContentReports", ["contentType"], { transaction });
      await queryInterface.addIndex("ContentReports", ["reason"], { transaction });
      await queryInterface.addIndex("ContentReports", ["reportedUserId"], { transaction });
      await queryInterface.addIndex("ContentReports", ["reporterId"], { transaction });
      await queryInterface.addIndex(
        "ContentReports",
        ["reporterId", "contentType", "contentId"],
        {
          name: "content_reports_reporter_item",
          transaction,
        }
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
      await queryInterface.dropTable("ContentReports", { transaction });
      await queryInterface.removeColumn("Users", "isSuspended", { transaction });
      await queryInterface.removeColumn("Users", "warningCount", { transaction });
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_ContentReports_contentType";',
        { transaction }
      );
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_ContentReports_reason";',
        { transaction }
      );
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_ContentReports_status";',
        { transaction }
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
