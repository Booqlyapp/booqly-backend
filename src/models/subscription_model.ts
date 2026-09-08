import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface SubscriptionAttributes {
  id: string;
  userId: string;
  planType: "client_free" | "client_referral" | "client_premium" | "solo_basic" | "solo_pro" | "solo_premium" | "suite_starter" | "suite_growing" | "suite_pro" | "suite_elite";
  stripeSubscriptionId: string | null;
  status: "active" | "canceled" | "past_due" | "unpaid" | "trialing" | "incomplete" | "incomplete_expired" | "paused";
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  metadata: object | null;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export class Subscription
  extends Model<InferAttributes<Subscription>, InferCreationAttributes<Subscription>>
  implements SubscriptionAttributes
{
  declare id: CreationOptional<string>;
  declare userId: string;
  declare planType: "client_free" | "client_referral" | "client_premium" | "solo_basic" | "solo_pro" | "solo_premium" | "suite_starter" | "suite_growing" | "suite_pro" | "suite_elite";
  declare stripeSubscriptionId: string | null;
  declare status: "active" | "canceled" | "past_due" | "unpaid" | "trialing" | "incomplete" | "incomplete_expired" | "paused";
  declare currentPeriodStart: Date | null;
  declare currentPeriodEnd: Date | null;
  declare trialEnd: Date | null;
  declare cancelAtPeriodEnd: boolean;
  declare metadata: object | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function initSubscription(sequelize: Sequelize) {
  console.log("Initializing Subscription model");
  Subscription.init(
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
      planType: {
        type: DataTypes.ENUM(
          "client_free",
          "client_referral", 
          "client_premium",
          "solo_basic",
          "solo_pro",
          "solo_premium",
          "suite_starter",
          "suite_growing",
          "suite_pro",
          "suite_elite"
        ),
        allowNull: false,
      },
      stripeSubscriptionId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("active", "canceled", "past_due", "unpaid", "trialing", "incomplete", "incomplete_expired", "paused"),
        allowNull: false,
        defaultValue: "active",
      },
      currentPeriodStart: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      currentPeriodEnd: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      trialEnd: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      cancelAtPeriodEnd: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      metadata: {
        type: DataTypes.JSONB,
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
      modelName: "Subscription",
      timestamps: true,
    }
  );

  return Subscription;
}
