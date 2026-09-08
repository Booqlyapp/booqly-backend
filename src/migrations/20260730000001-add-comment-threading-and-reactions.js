"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.addColumn(
        "VideoComments",
        "parentCommentId",
        {
          type: Sequelize.UUID,
          allowNull: true,
          references: {
            model: "VideoComments",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        { transaction }
      );

      await queryInterface.addColumn(
        "VideoComments",
        "likeCount",
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        { transaction }
      );

      await queryInterface.addColumn(
        "VideoComments",
        "dislikeCount",
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        { transaction }
      );

      await queryInterface.addColumn(
        "VideoComments",
        "replyCount",
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        { transaction }
      );

      await queryInterface.addIndex("VideoComments", ["parentCommentId"], {
        name: "video_comments_parent_comment_id_idx",
        transaction,
      });

      await queryInterface.createTable(
        "VideoCommentReactions",
        {
          id: {
            type: Sequelize.UUID,
            primaryKey: true,
            allowNull: false,
            defaultValue: Sequelize.UUIDV4,
          },
          commentId: {
            type: Sequelize.UUID,
            allowNull: false,
            references: {
              model: "VideoComments",
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
          type: {
            type: Sequelize.ENUM("like", "dislike"),
            allowNull: false,
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
          },
        },
        { transaction }
      );

      await queryInterface.addIndex("VideoCommentReactions", ["commentId", "userId"], {
        unique: true,
        name: "video_comment_reactions_comment_user_unique",
        transaction,
      });

      await queryInterface.addIndex("VideoCommentReactions", ["commentId"], {
        name: "video_comment_reactions_comment_id_idx",
        transaction,
      });

      await queryInterface.addIndex("VideoCommentReactions", ["userId"], {
        name: "video_comment_reactions_user_id_idx",
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
      await queryInterface.dropTable("VideoCommentReactions", { transaction });
      await queryInterface.removeIndex("VideoComments", "video_comments_parent_comment_id_idx", { transaction });
      await queryInterface.removeColumn("VideoComments", "replyCount", { transaction });
      await queryInterface.removeColumn("VideoComments", "dislikeCount", { transaction });
      await queryInterface.removeColumn("VideoComments", "likeCount", { transaction });
      await queryInterface.removeColumn("VideoComments", "parentCommentId", { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
