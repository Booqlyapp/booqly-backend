import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface BlockedTimeAttributes {
  id: string;
  marketplaceId: string;
  createdByUserId: string;
  assignedTeamMemberId?: string | null;
  blockType: string;
  customBlockType?: string | null;
  startDateTime: Date;
  endDateTime: Date;
  frequency: "one_time" | "daily";
  comments?: string | null;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
  deletedAt: CreationOptional<Date> | null;
}

export class BlockedTime
  extends Model<
    InferAttributes<BlockedTime>,
    InferCreationAttributes<BlockedTime>
  >
  implements BlockedTimeAttributes
{
  declare id: CreationOptional<string>;
  declare marketplaceId: string;
  declare createdByUserId: string;
  declare assignedTeamMemberId: string | null;
  declare blockType: string;
  declare customBlockType: string | null;
  declare startDateTime: Date;
  declare endDateTime: Date;
  declare frequency: "one_time" | "daily";
  declare comments: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date> | null;
}

export default function initBlockedTime(sequelize: Sequelize) {
  BlockedTime.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      marketplaceId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      createdByUserId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      assignedTeamMemberId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      blockType: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      customBlockType: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      startDateTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      endDateTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      frequency: {
        type: DataTypes.ENUM("one_time", "daily"),
        allowNull: false,
        defaultValue: "one_time",
      },
      comments: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "BlockedTime",
      tableName: "BlockedTimes",
      timestamps: true,
      paranoid: true,
    }
  );

  return BlockedTime;
}
