import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface SupportTicketMessageAttributes {
  id: string;
  ticketId: string;
  senderId: string;
  message: string;
  attachments: string[] | null;
  isInternal: boolean;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export class SupportTicketMessage
  extends Model<
    InferAttributes<SupportTicketMessage>,
    InferCreationAttributes<SupportTicketMessage>
  >
  implements SupportTicketMessageAttributes
{
  declare id: CreationOptional<string>;
  declare ticketId: string;
  declare senderId: string;
  declare message: string;
  declare attachments: string[] | null;
  declare isInternal: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function initSupportTicketMessage(sequelize: Sequelize) {
  SupportTicketMessage.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      ticketId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "SupportTickets", key: "id" },
      },
      senderId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      attachments: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: [],
      },
      isInternal: {
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
    },
    {
      sequelize,
      modelName: "SupportTicketMessage",
      tableName: "SupportTicketMessages",
      timestamps: true,
    }
  );

  return SupportTicketMessage;
}
