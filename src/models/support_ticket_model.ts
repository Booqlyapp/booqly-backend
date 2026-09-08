import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export type SupportTicketCategory =
  | "billing"
  | "app_issue"
  | "verification"
  | "account"
  | "payment";

export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";

export type SupportTicketPriority = "low" | "medium" | "high";

interface SupportTicketAttributes {
  id: string;
  ticketNumber: string;
  userId: string;
  createdById: string;
  category: SupportTicketCategory;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  assignedToId: string | null;
  attachments: string[] | null;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export class SupportTicket
  extends Model<InferAttributes<SupportTicket>, InferCreationAttributes<SupportTicket>>
  implements SupportTicketAttributes
{
  declare id: CreationOptional<string>;
  declare ticketNumber: string;
  declare userId: string;
  declare createdById: string;
  declare category: SupportTicketCategory;
  declare subject: string;
  declare description: string;
  declare status: SupportTicketStatus;
  declare priority: SupportTicketPriority;
  declare assignedToId: string | null;
  declare attachments: string[] | null;
  declare firstResponseAt: Date | null;
  declare resolvedAt: Date | null;
  declare closedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function initSupportTicket(sequelize: Sequelize) {
  SupportTicket.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      ticketNumber: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
      createdById: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
      category: {
        type: DataTypes.ENUM(
          "billing",
          "app_issue",
          "verification",
          "account",
          "payment"
        ),
        allowNull: false,
      },
      subject: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING(1000),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("open", "in_progress", "resolved", "closed"),
        allowNull: false,
        defaultValue: "open",
      },
      priority: {
        type: DataTypes.ENUM("low", "medium", "high"),
        allowNull: false,
        defaultValue: "medium",
      },
      assignedToId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "Users", key: "id" },
      },
      attachments: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: [],
      },
      firstResponseAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      resolvedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      closedAt: {
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
      modelName: "SupportTicket",
      tableName: "SupportTickets",
      timestamps: true,
    }
  );

  return SupportTicket;
}
