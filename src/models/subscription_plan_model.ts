import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface SubscriptionPlanAttributes {
  id: string;
  name: string;
  stripePriceId: string;
  userRole: "client" | "solo" | "suite";
  price: number;
  interval: "month" | "year";
  features: object;
  isActive: boolean;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export class SubscriptionPlan
  extends Model<InferAttributes<SubscriptionPlan>, InferCreationAttributes<SubscriptionPlan>>
  implements SubscriptionPlanAttributes
{
  declare id: CreationOptional<string>;
  declare name: string;
  declare stripePriceId: string;
  declare userRole: "client" | "solo" | "suite";
  declare price: number;
  declare interval: "month" | "year";
  declare features: object;
  declare isActive: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function initSubscriptionPlan(sequelize: Sequelize) {
  console.log("Initializing SubscriptionPlan model");
  SubscriptionPlan.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      stripePriceId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      userRole: {
        type: DataTypes.ENUM("client", "solo", "suite"),
        allowNull: false,
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      interval: {
        type: DataTypes.ENUM("month", "year"),
        allowNull: false,
      },
      features: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      isActive: {
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
      modelName: "SubscriptionPlan",
      timestamps: true,
    }
  );

  return SubscriptionPlan;
}
