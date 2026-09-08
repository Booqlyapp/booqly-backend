import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

import { Marketplace } from "./marketplace_model";

interface UserAttributes {
  id: string;
  name: string | null;
  email: string;
  password: string;
  phone: string | null;
  role: "client" | "solo" | "suite" | "admin";
  businessName: string | null;
  status: "pending" | "verified" | "rejected" | null;
  accountVerified: boolean | false;
  profilePic: string | null;
  marketplaceId: string | null;
  stripeCustomerId: string | null;
  stripeConnectAccountId: string | null;
  stripeConnectChargesEnabled: boolean;
  stripeConnectPayoutsEnabled: boolean;
  stripeConnectDetailsSubmitted: boolean;
  currentSubscriptionId: string | null;
  referralCode: string | null;
  referredBy: string | null;
  freeBookingUsed: boolean | false;
  identityDocumentUrl: string | null;
  identityVerified: boolean;
  professionalVerified: boolean;
  businessVerified: boolean;
  professionalLicenseType: string | null;
  professionalDocumentUrl: string | null;
  businessDocumentUrl: string | null;
  fcmToken: string | null;
  passwordResetOtp: string | null;
  passwordResetOtpExpiresAt: Date | null;
  isTeamMember: boolean;
  isSuspended: boolean;
  warningCount: number;
  teamOwnerId: string | null;
  jobTitle: string | null;
  employmentStartDate: Date | null;
  employmentEndDate: Date | null;
  // Social media fields for clients
  insta: string | null;
  tiktok: string | null;
  facebook: string | null;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
  deletedAt: CreationOptional<Date> | null;
}

export class User
  extends Model<InferAttributes<User>, InferCreationAttributes<User>>
  implements UserAttributes
{
  declare id: CreationOptional<string>;
  declare name: string | null;
  declare email: string;
  declare password: string;
  declare phone: string | null;
  declare role: "client" | "solo" | "suite" | "admin";
  declare businessName: string | null;
  declare status: "pending" | "verified" | "rejected" | null;
  declare accountVerified: boolean | false;
  declare profilePic: string | null;
  declare marketplaceId: string | null;
  declare stripeCustomerId: string | null;
  declare stripeConnectAccountId: string | null;
  declare stripeConnectChargesEnabled: CreationOptional<boolean>;
  declare stripeConnectPayoutsEnabled: CreationOptional<boolean>;
  declare stripeConnectDetailsSubmitted: CreationOptional<boolean>;
  declare currentSubscriptionId: string | null;
  declare referralCode: string | null;
  declare referredBy: string | null;
  declare freeBookingUsed: boolean;
  declare identityDocumentUrl: string | null;
  declare identityVerified: CreationOptional<boolean>;
  declare professionalVerified: CreationOptional<boolean>;
  declare businessVerified: CreationOptional<boolean>;
  declare professionalLicenseType: string | null;
  declare professionalDocumentUrl: string | null;
  declare businessDocumentUrl: string | null;
  declare fcmToken: string | null;
  declare passwordResetOtp: string | null;
  declare passwordResetOtpExpiresAt: Date | null;
  declare isTeamMember: CreationOptional<boolean>;
  declare isSuspended: CreationOptional<boolean>;
  declare warningCount: CreationOptional<number>;
  declare teamOwnerId: string | null;
  declare jobTitle: string | null;
  declare employmentStartDate: Date | null;
  declare employmentEndDate: Date | null;
  // Social media fields for clients
  declare insta: string | null;
  declare tiktok: string | null;
  declare facebook: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date> | null;

  // Associations
  declare subscriptions?: any[];
}

export default function initUser(sequelize: Sequelize) {
  console.log("Initializing User model");
  User.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      role: {
        type: DataTypes.ENUM("client", "solo", "suite", "admin"),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("pending", "verified", "rejected"),
        allowNull: true,
      },
      accountVerified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      businessName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      profilePic: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      marketplaceId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "Marketplaces",
          key: "id",
        },
      },
      stripeCustomerId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      stripeConnectAccountId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      stripeConnectChargesEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      stripeConnectPayoutsEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      stripeConnectDetailsSubmitted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      currentSubscriptionId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      referralCode: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },
      referredBy: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "Users",
          key: "id",
        },
      },
      freeBookingUsed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      identityDocumentUrl: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      identityVerified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      professionalVerified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      businessVerified: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      professionalLicenseType: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      professionalDocumentUrl: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      businessDocumentUrl: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      fcmToken: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      passwordResetOtp: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      passwordResetOtpExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      isTeamMember: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      isSuspended: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      warningCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      teamOwnerId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "Users",
          key: "id",
        },
      },
      jobTitle: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      employmentStartDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      employmentEndDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      // Social media fields for clients
      insta: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      tiktok: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      facebook: {
        type: DataTypes.STRING,
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
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "User",
      timestamps: true,
      paranoid: true, // enables soft deletes (deletedAt)
      defaultScope: {
        attributes: { exclude: ['password', 'passwordResetOtp', 'passwordResetOtpExpiresAt'] }
      },
      scopes: {
        withPassword: {
          attributes: { include: ['password'] }
        }
      }
    }
  );

  return User;
}
