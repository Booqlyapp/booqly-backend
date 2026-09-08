import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

// Marketplace Attributes
interface MarketplaceAttributes {
  id: string;
  businessName: string;
  phoneNumber: string | null;
  businessEmail: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  imagesList: string[] | null;
  portfolioImages: string[] | null;
  bio: string | null;
  policyRules: string | null;
  showPolicyRules: boolean;
  customLink: string | null;
  bookingPageTitle: string | null;
  bookingPageSubtitle: string | null;
  bookingPageHeaderImage: string | null;
  bookingPageHeaderPdf: string | null;
  waitlistEnabled: boolean;
  waitlistClaimWindowMinutes: number;
  scheduleId: string | null;
  userId: string | null;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
  deletedAt: CreationOptional<Date> | null;
}

export class Marketplace
  extends Model<
    InferAttributes<Marketplace>,
    InferCreationAttributes<Marketplace>
  >
  implements MarketplaceAttributes
{
  declare id: CreationOptional<string>;
  declare businessName: string;
  declare phoneNumber: string | null;
  declare businessEmail: string | null;
  declare address: string | null;
  declare latitude: number | null;
  declare longitude: number | null;
  declare imagesList: string[] | null;
  declare portfolioImages: string[] | null;
  declare bio: string | null;
  declare policyRules: string | null;
  declare showPolicyRules: boolean;
  declare customLink: string | null;
  declare bookingPageTitle: string | null;
  declare bookingPageSubtitle: string | null;
  declare bookingPageHeaderImage: string | null;
  declare bookingPageHeaderPdf: string | null;
  declare waitlistEnabled: CreationOptional<boolean>;
  declare waitlistClaimWindowMinutes: CreationOptional<number>;
  declare scheduleId: string | null;
  declare userId: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date> | null;
}

export default function initMarketplace(sequelize: Sequelize) {
  console.log("Initializing Marketplace model");
  Marketplace.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      businessName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      phoneNumber: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      businessEmail: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isEmail: {
            msg: "Please provide a valid business email address"
          }
        }
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      latitude: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      longitude: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      imagesList: {
        type: DataTypes.JSONB, // Storing image list as a JSON array
        allowNull: true,
      },
      portfolioImages: {
        type: DataTypes.JSONB, // Storing portfolio images as a JSON array
        allowNull: true,
      },
      bio: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      policyRules: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      showPolicyRules: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      customLink: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
        validate: {
          is: {
            args: /^[a-z0-9-]+$/,
            msg: 'Custom link can only contain lowercase letters, numbers, and hyphens'
          },
          len: {
            args: [3, 30],
            msg: 'Custom link must be between 3 and 30 characters'
          }
        }
      },
      bookingPageTitle: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      bookingPageSubtitle: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      bookingPageHeaderImage: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      bookingPageHeaderPdf: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      waitlistEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      waitlistClaimWindowMinutes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 15,
        validate: {
          min: 15,
          max: 30,
        },
      },
      scheduleId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "Schedules",
          key: "id",
        },
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "Users",
          key: "id",
        },
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
      modelName: "Marketplace",
      timestamps: true,
      paranoid: true,
    }
  );

  return Marketplace;
}
