import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface VideoAttributes {
  id: string;
  userId: string;
  videoUrl: string;
  caption: string | null;
  location: string | null;
  tags: string[];
  thumbnailUrl: string | null;
  likeCount: number;
  commentCount: number;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export class Video
  extends Model<InferAttributes<Video>, InferCreationAttributes<Video>>
  implements VideoAttributes
{
  declare id: CreationOptional<string>;
  declare userId: string;
  declare videoUrl: string;
  declare caption: string | null;
  declare location: string | null;
  declare tags: CreationOptional<string[]>;
  declare thumbnailUrl: string | null;
  declare likeCount: CreationOptional<number>;
  declare commentCount: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare owner?: unknown;
  declare likes?: unknown[];
  declare comments?: unknown[];
}

export default function initVideo(sequelize: Sequelize) {
  Video.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
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
      videoUrl: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      caption: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      location: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      tags: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false,
        defaultValue: [],
      },
      thumbnailUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      likeCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      commentCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: "Video",
      tableName: "Videos",
      timestamps: true,
      indexes: [
        {
          fields: ["userId", "createdAt"],
        },
        {
          fields: ["createdAt"],
        },
      ],
    }
  );

  return Video;
}