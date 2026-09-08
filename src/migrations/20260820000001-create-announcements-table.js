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
            AND table_name = 'Announcements'
        ) AS "exists";
        `,
        { transaction }
      );

      if (rows?.[0]?.exists) {
        await transaction.commit();
        return;
      }

      await queryInterface.createTable(
        "Announcements",
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.UUIDV4,
            primaryKey: true,
            allowNull: false,
          },
          title: {
            type: Sequelize.STRING(200),
            allowNull: false,
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          iconType: {
            type: Sequelize.ENUM("megaphone", "gift", "wrench", "star", "warning"),
            allowNull: false,
            defaultValue: "megaphone",
          },
          audience: {
            type: Sequelize.ENUM("all_users", "active_users", "clients", "providers"),
            allowNull: false,
            defaultValue: "all_users",
          },
          type: {
            type: Sequelize.ENUM(
              "policy_update",
              "promotion",
              "system_update",
              "feature_update",
              "alert"
            ),
            allowNull: false,
          },
          status: {
            type: Sequelize.ENUM("draft", "scheduled", "published", "expired"),
            allowNull: false,
            defaultValue: "draft",
          },
          scheduledAt: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          publishedAt: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          expiresAt: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          createdById: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: "Users", key: "id" },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT",
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

      await queryInterface.addIndex("Announcements", ["status"], { transaction });
      await queryInterface.addIndex("Announcements", ["type"], { transaction });
      await queryInterface.addIndex("Announcements", ["audience"], { transaction });
      await queryInterface.addIndex("Announcements", ["scheduledAt"], { transaction });
      await queryInterface.addIndex("Announcements", ["publishedAt"], { transaction });
      await queryInterface.addIndex("Announcements", ["createdById"], { transaction });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.dropTable("Announcements", { transaction });
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_Announcements_iconType";',
        { transaction }
      );
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_Announcements_audience";',
        { transaction }
      );
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_Announcements_type";',
        { transaction }
      );
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_Announcements_status";',
        { transaction }
      );
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
