"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.createTable(
        "VideoLikes",
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.UUIDV4,
          },
          videoId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "Videos",
              key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "CASCADE",
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
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
          },
        },
        { transaction }
      );

      await queryInterface.addIndex("VideoLikes", ["videoId", "userId"], {
        unique: true,
        name: "video_likes_video_user_unique",
        transaction,
      });

      await queryInterface.addIndex("VideoLikes", ["videoId"], {
        name: "video_likes_video_id_idx",
        transaction,
      });

      await queryInterface.addIndex("VideoLikes", ["userId"], {
        name: "video_likes_user_id_idx",
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
      await queryInterface.dropTable("VideoLikes", { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};