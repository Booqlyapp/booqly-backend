import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface MessageAttributes {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  messageType: "text" | "image" | "system" | "reel";
  attachments: object | null;
  isRead: boolean;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
  deletedAt: CreationOptional<Date> | null;
}

export class Message
  extends Model<InferAttributes<Message>, InferCreationAttributes<Message>>
  implements MessageAttributes
{
  declare id: CreationOptional<string>;
  declare conversationId: string;
  declare senderId: string;
  declare content: string | null;
  declare messageType: "text" | "image" | "system" | "reel";
  declare attachments: object | null;
  declare isRead: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date> | null;
}

export default function initMessage(sequelize: Sequelize) {
  console.log("Initializing Message model");
  Message.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      conversationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Conversations",
          key: "id",
        },
      },
      senderId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      messageType: {
        type: DataTypes.ENUM("text", "image", "system", "reel"),
        allowNull: false,
        defaultValue: "text",
      },
      attachments: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      isRead: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
      modelName: "Message",
      timestamps: true,
      paranoid: true,
    }
  );

  return Message;
}
