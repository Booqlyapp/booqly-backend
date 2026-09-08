"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        "Videos",
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.UUIDV4,
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
          videoUrl: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          caption: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          thumbnailUrl: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          likeCount: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
          },
          commentCount: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
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

      await queryInterface.addIndex("Videos", ["userId", "createdAt"], {
        name: "videos_user_created_at_idx",
        transaction,
      });

      await queryInterface.addIndex("Videos", ["createdAt"], {
        name: "videos_created_at_idx",
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
      await queryInterface.dropTable("Videos", { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};