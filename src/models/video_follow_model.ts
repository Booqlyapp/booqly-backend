import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface VideoFollowAttributes {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: CreationOptional<Date>;
}

export class VideoFollow
  extends Model<InferAttributes<VideoFollow>, InferCreationAttributes<VideoFollow>>
  implements VideoFollowAttributes
{
  declare id: CreationOptional<string>;
  declare followerId: string;
  declare followingId: string;
  declare createdAt: CreationOptional<Date>;

  declare follower?: unknown;
  declare following?: unknown;
}

export default function initVideoFollow(sequelize: Sequelize) {
  VideoFollow.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      followerId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      followingId: {
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
      modelName: "VideoFollow",
      tableName: "VideoFollows",
      timestamps: true,
      updatedAt: false,
      indexes: [
        {
          unique: true,
          fields: ["followerId", "followingId"],
        },
        {
          fields: ["followerId"],
        },
        {
          fields: ["followingId"],
        },
      ],
    }
  );

  return VideoFollow;
}
