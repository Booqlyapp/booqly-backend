import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

import { User } from "./user_model";

interface FriendAttributes {
  id: string;
  userId: string;
  friendId: string;
  status: "pending" | "accepted" | "blocked";
  requestedBy: string;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
  deletedAt: CreationOptional<Date> | null;
}

export class Friend
  extends Model<InferAttributes<Friend>, InferCreationAttributes<Friend>>
  implements FriendAttributes
{
  declare id: CreationOptional<string>;
  declare userId: string;
  declare friendId: string;
  declare status: "pending" | "accepted" | "blocked";
  declare requestedBy: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date> | null;

  // Associations
  declare user?: User;
  declare friend?: User;
  declare requester?: User;
}

export default function initFriend(sequelize: Sequelize) {
  console.log("Initializing Friend model");
  Friend.init(
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
      },
      friendId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
      },
      status: {
        type: DataTypes.ENUM("pending", "accepted", "blocked"),
        allowNull: false,
        defaultValue: "pending",
      },
      requestedBy: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Friend",
      timestamps: true,
      paranoid: true, // enables soft deletes (deletedAt)
      indexes: [
        {
          unique: true,
          fields: ['userId', 'friendId'],
          name: 'unique_friendship'
        },
        {
          fields: ['userId']
        },
        {
          fields: ['friendId']
        },
        {
          fields: ['status']
        }
      ]
    }
  );

  return Friend;
}
