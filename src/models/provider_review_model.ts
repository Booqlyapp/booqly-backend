import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface ProviderReviewAttributes {
  id: string;
  providerId: string;
  clientId: string;
  appointmentId: string | null;
  rating: number;
  comment: string | null;
  isPublic: boolean;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export class ProviderReview
  extends Model<InferAttributes<ProviderReview>, InferCreationAttributes<ProviderReview>>
  implements ProviderReviewAttributes
{
  declare id: CreationOptional<string>;
  declare providerId: string;
  declare clientId: string;
  declare appointmentId: string | null;
  declare rating: number;
  declare comment: string | null;
  declare isPublic: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function initProviderReview(sequelize: Sequelize) {
  console.log("Initializing ProviderReview model");
  ProviderReview.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      providerId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
      },
      clientId: {
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
          min: 1,
          max: 5,
        },
      },
      comment: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isPublic: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
      modelName: "ProviderReview",
      timestamps: true,
    }
  );

  return ProviderReview;
}
