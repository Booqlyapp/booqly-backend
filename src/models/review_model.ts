import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface ReviewAttributes {
  id: string;
  clientId: string;
  providerId: string;
  appointmentId: string | null;
  rating: number;
  comment: string | null;
  type: "verified" | "semi_verified";
  proofDocument: string | null;
  status: "pending" | "approved" | "rejected";
  isPublic: boolean;
  providerResponse: string | null;
  respondedAt: Date | null;
  providerRating: number | null;
  clientPrompted: boolean;
  providerPrompted: boolean;
  clientPromptedAt: Date | null;
  providerPromptedAt: Date | null;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export class Review
  extends Model<InferAttributes<Review>, InferCreationAttributes<Review>>
  implements ReviewAttributes
{
  declare id: CreationOptional<string>;
  declare clientId: string;
  declare providerId: string;
  declare appointmentId: string | null;
  declare rating: number;
  declare comment: string | null;
  declare type: "verified" | "semi_verified";
  declare proofDocument: string | null;
  declare status: "pending" | "approved" | "rejected";
  declare isPublic: boolean;
  declare providerResponse: string | null;
  declare respondedAt: Date | null;
  declare providerRating: number | null;
  declare clientPrompted: boolean;
  declare providerPrompted: boolean;
  declare clientPromptedAt: Date | null;
  declare providerPromptedAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function initReview(sequelize: Sequelize) {
  console.log("Initializing Review model");
  Review.init(
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
      appointmentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "Appointments",
          key: "id",
        },
      },
      rating: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 0, // Allow 0 for placeholder records
          max: 5,
        },
      },
      comment: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      type: {
        type: DataTypes.ENUM("verified", "semi_verified"),
        allowNull: false,
      },
      proofDocument: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        allowNull: false,
        defaultValue: "pending",
      },
      isPublic: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      providerResponse: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      respondedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      providerRating: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 1,
          max: 5,
        },
      },
      clientPrompted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      providerPrompted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      clientPromptedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      providerPromptedAt: {
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
      modelName: "Review",
      timestamps: true,
    }
  );

  return Review;
}
