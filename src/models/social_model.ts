import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

// Social Attributes
interface SocialAttributes {
  id: string;
  insta: string | null;
  tiktok: string | null;
  facebook: string | null;
  googlePlaceId: string | null;
  marketplaceId: string | null; // Foreign key to Marketplace
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
  deletedAt: CreationOptional<Date> | null;
}

export class Social
  extends Model<InferAttributes<Social>, InferCreationAttributes<Social>>
  implements SocialAttributes
{
  declare id: CreationOptional<string>;
  declare insta: string | null;
  declare tiktok: string | null;
  declare facebook: string | null;
  declare googlePlaceId: string | null;
  declare marketplaceId: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date> | null;
}

export default function initSocial(sequelize: Sequelize) {
  console.log("Initializing Social model");
  Social.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
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
      googlePlaceId: {
        type: DataTypes.STRING,
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
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Social",
      timestamps: true,
      paranoid: true,
    }
  );

  return Social;
}
