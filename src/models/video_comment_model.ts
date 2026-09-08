import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface VideoCommentAttributes {
  id: string;
  videoId: string;
  userId: string;
  parentCommentId: string | null;
  commentText: string;
  likeCount: number;
  dislikeCount: number;
  replyCount: number;
  createdAt: CreationOptional<Date>;
}

export class VideoComment
  extends Model<InferAttributes<VideoComment>, InferCreationAttributes<VideoComment>>
  implements VideoCommentAttributes
{
  declare id: CreationOptional<string>;
  declare videoId: string;
  declare userId: string;
  declare parentCommentId: string | null;
  declare commentText: string;
  declare likeCount: CreationOptional<number>;
  declare dislikeCount: CreationOptional<number>;
  declare replyCount: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;

  declare user?: unknown;
  declare video?: unknown;
  declare parentComment?: unknown;
  declare replies?: unknown[];
}

export default function initVideoComment(sequelize: Sequelize) {
  VideoComment.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      videoId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Videos",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      parentCommentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "VideoComments",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      commentText: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      likeCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      dislikeCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      replyCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: "VideoComment",
      tableName: "VideoComments",
      timestamps: true,
      updatedAt: false,
      indexes: [
        {
          fields: ["videoId", "createdAt"],
        },
        {
          fields: ["userId"],
        },
        {
          fields: ["parentCommentId"],
        },
      ],
    }
  );

  return VideoComment;
}