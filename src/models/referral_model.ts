import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface ReferralAttributes {
  id: string;
  referrerId: string;
  referredUserId: string;
  referralCode: string;
  status: "active" | "inactive";
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export class Referral
  extends Model<InferAttributes<Referral>, InferCreationAttributes<Referral>>
  implements ReferralAttributes
{
  declare id: CreationOptional<string>;
  declare referrerId: string;
  declare referredUserId: string;
  declare referralCode: string;
  declare status: "active" | "inactive";
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function initReferral(sequelize: Sequelize) {
  console.log("Initializing Referral model");
  Referral.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      referrerId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
      },
      referredUserId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
      },
      referralCode: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("active", "inactive"),
        allowNull: false,
        defaultValue: "active",
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
      modelName: "Referral",
      timestamps: true,
    }
  );

  return Referral;
}
