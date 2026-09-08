import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface NotificationAttributes {
  id: string;
  userId: string;
  type: "booking_confirmation" | "booking_reminder" | "message" | "review" | "payment" | "subscription" | "review_response" | "identity_verified" | "identity_rejected";
  title: string;
  content: string;
  data: object | null;
  channels: object;
  isRead: boolean;
  sentAt: Date | null;
  createdAt: CreationOptional<Date>;
}

export class Notification
  extends Model<InferAttributes<Notification>, InferCreationAttributes<Notification>>
  implements NotificationAttributes
{
  declare id: CreationOptional<string>;
  declare userId: string;
  declare type: "booking_confirmation" | "booking_reminder" | "message" | "review" | "payment" | "subscription" | "review_response" | "identity_verified" | "identity_rejected";
  declare title: string;
  declare content: string;
  declare data: object | null;
  declare channels: object;
  declare isRead: boolean;
  declare sentAt: Date | null;
  declare createdAt: CreationOptional<Date>;
}

export default function initNotification(sequelize: Sequelize) {
  console.log("Initializing Notification model");
  Notification.init(
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
      type: {
        type: DataTypes.ENUM(
          "booking_confirmation",
          "booking_reminder",
          "message",
          "review",
          "payment",
          "subscription",
          "review_response",
          "identity_verified",
          "identity_rejected"
        ),
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      data: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      channels: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {
          push: true,
          sms: false,
          email: false,
          in_app: true,
        },
      },
      isRead: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      sentAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Notification",
      timestamps: false,
    }
  );

  return Notification;
}
