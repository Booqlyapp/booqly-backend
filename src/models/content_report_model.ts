import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export type ContentReportType = "message" | "photo" | "service_listing" | "profile";
export type ContentReportReason =
  | "inappropriate_content"
  | "nudity"
  | "misleading_information"
  | "impersonation"
  | "harassment";
export type ContentReportStatus = "pending" | "dismissed" | "warned" | "suspended";

interface ContentReportAttributes {
  id: string;
  reporterId: string;
  reportedUserId: string;
  originalUserId: string | null;
  contentType: ContentReportType;
  contentId: string;
  reason: ContentReportReason;
  details: string | null;
  contentPreview: string | null;
  contentThumbnailUrl: string | null;
  status: ContentReportStatus;
  adminNote: string | null;
  resolvedById: string | null;
  resolvedAt: Date | null;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export class ContentReport
  extends Model<InferAttributes<ContentReport>, InferCreationAttributes<ContentReport>>
  implements ContentReportAttributes
{
  declare id: CreationOptional<string>;
  declare reporterId: string;
  declare reportedUserId: string;
  declare originalUserId: string | null;
  declare contentType: ContentReportType;
  declare contentId: string;
  declare reason: ContentReportReason;
  declare details: string | null;
  declare contentPreview: string | null;
  declare contentThumbnailUrl: string | null;
  declare status: ContentReportStatus;
  declare adminNote: string | null;
  declare resolvedById: string | null;
  declare resolvedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function initContentReport(sequelize: Sequelize) {
  ContentReport.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      reporterId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
      reportedUserId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
      originalUserId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "Users", key: "id" },
      },
      contentType: {
        type: DataTypes.ENUM("message", "photo", "service_listing", "profile"),
        allowNull: false,
      },
      contentId: {
        type: DataTypes.STRING(1000),
        allowNull: false,
      },
      reason: {
        type: DataTypes.ENUM(
          "inappropriate_content",
          "nudity",
          "misleading_information",
          "impersonation",
          "harassment"
        ),
        allowNull: false,
      },
      details: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      contentPreview: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      contentThumbnailUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("pending", "dismissed", "warned", "suspended"),
        allowNull: false,
        defaultValue: "pending",
      },
      adminNote: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      resolvedById: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "Users", key: "id" },
      },
      resolvedAt: {
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
      modelName: "ContentReport",
      tableName: "ContentReports",
      timestamps: true,
    }
  );

  return ContentReport;
}
