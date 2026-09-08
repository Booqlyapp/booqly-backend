import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export type VideoCommentReactionType = "like" | "dislike";

interface VideoCommentReactionAttributes {
  id: string;
  commentId: string;
  userId: string;
  type: VideoCommentReactionType;
  createdAt: CreationOptional<Date>;
}

export class VideoCommentReaction
  extends Model<InferAttributes<VideoCommentReaction>, InferCreationAttributes<VideoCommentReaction>>
  implements VideoCommentReactionAttributes
{
  declare id: CreationOptional<string>;
  declare commentId: string;
  declare userId: string;
  declare type: VideoCommentReactionType;
  declare createdAt: CreationOptional<Date>;

  declare user?: unknown;
  declare comment?: unknown;
}

export default function initVideoCommentReaction(sequelize: Sequelize) {
  VideoCommentReaction.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      commentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "VideoComments",
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
      type: {
        type: DataTypes.ENUM("like", "dislike"),
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: "VideoCommentReaction",
      tableName: "VideoCommentReactions",
      timestamps: true,
      updatedAt: false,
      indexes: [
        {
          unique: true,
          fields: ["commentId", "userId"],
        },
        {
          fields: ["commentId"],
        },
        {
          fields: ["userId"],
        },
      ],
    }
  );

  return VideoCommentReaction;
}
