import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class PortfolioCollectionItem
  extends Model<
    InferAttributes<PortfolioCollectionItem>,
    InferCreationAttributes<PortfolioCollectionItem>
  >
{
  declare id: CreationOptional<string>;
  declare collectionId: string;
  declare ownerUserId: string;
  declare itemType: "portfolio_image" | "reel";
  declare imageUrl: string | null;
  declare marketplaceId: string | null;
  declare videoId: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function initPortfolioCollectionItem(sequelize: Sequelize) {
  PortfolioCollectionItem.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      collectionId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "PortfolioCollections", key: "id" },
      },
      ownerUserId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
      itemType: {
        type: DataTypes.ENUM("portfolio_image", "reel"),
        allowNull: false,
      },
      imageUrl: { type: DataTypes.TEXT, allowNull: true },
      marketplaceId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "Marketplaces", key: "id" },
      },
      videoId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "Videos", key: "id" },
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      modelName: "PortfolioCollectionItem",
      tableName: "PortfolioCollectionItems",
      timestamps: true,
    }
  );
  return PortfolioCollectionItem;
}
