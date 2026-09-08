import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface ReferralInviteAttributes {
  id: string;
  providerId: string;
  clientId: string;
  referralCode: string;
  providerName: string;
  providerBusinessName: string | null;
  benefits: string | null;
  status: "pending" | "applied" | "expired";
  sentAt: Date;
  appliedAt: Date | null;
  expiresAt: Date | null;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export class ReferralInvite
  extends Model<InferAttributes<ReferralInvite>, InferCreationAttributes<ReferralInvite>>
  implements ReferralInviteAttributes
{
  declare id: CreationOptional<string>;
  declare providerId: string;
  declare clientId: string;
  declare referralCode: string;
  declare providerName: string;
  declare providerBusinessName: string | null;
  declare benefits: string | null;
  declare status: "pending" | "applied" | "expired";
  declare sentAt: Date;
  declare appliedAt: Date | null;
  declare expiresAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function initReferralInvite(sequelize: Sequelize) {
  console.log("Initializing ReferralInvite model");
  ReferralInvite.init(
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
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      clientId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      referralCode: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      providerName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      providerBusinessName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      benefits: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("pending", "applied", "expired"),
        allowNull: false,
        defaultValue: "pending",
      },
      sentAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      appliedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      expiresAt: {
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
      modelName: "ReferralInvite",
      timestamps: true,
    }
  );

  return ReferralInvite;
}
