import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export type ReviewFlagStatus = "pending" | "flagged" | "approved" | "rejected";
export type ReviewDirection = "client_to_provider" | "provider_to_client";

interface ReviewFlagAttributes {
  id: string;
  reviewId: string;
  flaggedById: string;
  reviewDirection: ReviewDirection;
  reason: string | null;
  status: ReviewFlagStatus;
  adminNote: string | null;
  resolvedById: string | null;
  resolvedAt: Date | null;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export class ReviewFlag
  extends Model<InferAttributes<ReviewFlag>, InferCreationAttributes<ReviewFlag>>
  implements ReviewFlagAttributes
{
  declare id: CreationOptional<string>;
  declare reviewId: string;
  declare flaggedById: string;
  declare reviewDirection: ReviewDirection;
  declare reason: string | null;
  declare status: ReviewFlagStatus;
  declare adminNote: string | null;
  declare resolvedById: string | null;
  declare resolvedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function initReviewFlag(sequelize: Sequelize) {
  ReviewFlag.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      reviewId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Reviews",
          key: "id",
        },
      },
      flaggedById: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
      },
      reviewDirection: {
        type: DataTypes.ENUM("client_to_provider", "provider_to_client"),
        allowNull: false,
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("pending", "flagged", "approved", "rejected"),
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
        references: {
          model: "Users",
          key: "id",
        },
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
      modelName: "ReviewFlag",
      tableName: "ReviewFlags",
      timestamps: true,
    }
  );

  return ReviewFlag;
}
