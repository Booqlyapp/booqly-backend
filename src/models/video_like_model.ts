import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface VideoLikeAttributes {
  id: string;
  videoId: string;
  userId: string;
  createdAt: CreationOptional<Date>;
}

export class VideoLike
  extends Model<InferAttributes<VideoLike>, InferCreationAttributes<VideoLike>>
  implements VideoLikeAttributes
{
  declare id: CreationOptional<string>;
  declare videoId: string;
  declare userId: string;
  declare createdAt: CreationOptional<Date>;

  declare user?: unknown;
  declare video?: unknown;
}

export default function initVideoLike(sequelize: Sequelize) {
  VideoLike.init(
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
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: "VideoLike",
      tableName: "VideoLikes",
      timestamps: true,
      updatedAt: false,
      indexes: [
        {
          unique: true,
          fields: ["videoId", "userId"],
        },
        {
          fields: ["videoId"],
        },
        {
          fields: ["userId"],
        },
      ],
    }
  );

  return VideoLike;
}