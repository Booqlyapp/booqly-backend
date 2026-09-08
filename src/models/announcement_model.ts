import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export type AnnouncementType =
  | "policy_update"
  | "promotion"
  | "system_update"
  | "feature_update"
  | "alert";

export type AnnouncementAudience = "all_users" | "active_users" | "clients" | "providers";

export type AnnouncementStatus = "draft" | "scheduled" | "published" | "expired";

export type AnnouncementIconType =
  | "megaphone"
  | "gift"
  | "wrench"
  | "star"
  | "warning";

interface AnnouncementAttributes {
  id: string;
  title: string;
  description: string | null;
  iconType: AnnouncementIconType;
  audience: AnnouncementAudience;
  type: AnnouncementType;
  status: AnnouncementStatus;
  scheduledAt: Date | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
  createdById: string;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export class Announcement
  extends Model<InferAttributes<Announcement>, InferCreationAttributes<Announcement>>
  implements AnnouncementAttributes
{
  declare id: CreationOptional<string>;
  declare title: string;
  declare description: string | null;
  declare iconType: AnnouncementIconType;
  declare audience: AnnouncementAudience;
  declare type: AnnouncementType;
  declare status: AnnouncementStatus;
  declare scheduledAt: Date | null;
  declare publishedAt: Date | null;
  declare expiresAt: Date | null;
  declare createdById: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function initAnnouncement(sequelize: Sequelize) {
  Announcement.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      title: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      iconType: {
        type: DataTypes.ENUM("megaphone", "gift", "wrench", "star", "warning"),
        allowNull: false,
        defaultValue: "megaphone",
      },
      audience: {
        type: DataTypes.ENUM("all_users", "active_users", "clients", "providers"),
        allowNull: false,
        defaultValue: "all_users",
      },
      type: {
        type: DataTypes.ENUM(
          "policy_update",
          "promotion",
          "system_update",
          "feature_update",
          "alert"
        ),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("draft", "scheduled", "published", "expired"),
        allowNull: false,
        defaultValue: "draft",
      },
      scheduledAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      publishedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      createdById: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Users", key: "id" },
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
      modelName: "Announcement",
      tableName: "Announcements",
      timestamps: true,
    }
  );

  return Announcement;
}
