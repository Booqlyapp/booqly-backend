import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface ConversationAttributes {
  id: string;
  clientId: string;
  providerId: string;
  status: "pending" | "active" | "blocked";
  clientMessageCount: number;
  providerHasResponded: boolean;
  lastMessageAt: Date | null;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export class Conversation
  extends Model<InferAttributes<Conversation>, InferCreationAttributes<Conversation>>
  implements ConversationAttributes
{
  declare id: CreationOptional<string>;
  declare clientId: string;
  declare providerId: string;
  declare status: "pending" | "active" | "blocked";
  declare clientMessageCount: number;
  declare providerHasResponded: boolean;
  declare lastMessageAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function initConversation(sequelize: Sequelize) {
  console.log("Initializing Conversation model");
  Conversation.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      clientId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
      },
      providerId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
      },
      status: {
        type: DataTypes.ENUM("pending", "active", "blocked"),
        allowNull: false,
        defaultValue: "pending",
      },
      clientMessageCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      providerHasResponded: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      lastMessageAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Conversation",
      timestamps: true,
    }
  );

  return Conversation;
}
