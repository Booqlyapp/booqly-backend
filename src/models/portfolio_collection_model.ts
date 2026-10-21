import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class PortfolioCollection
  extends Model<
    InferAttributes<PortfolioCollection>,
    InferCreationAttributes<PortfolioCollection>
  >
{
  declare id: CreationOptional<string>;
  declare ownerUserId: string;
  declare name: string;
  declare coverImageUrl: string | null;
  declare isPrivate: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function initPortfolioCollection(sequelize: Sequelize) {
  PortfolioCollection.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      ownerUserId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
      name: {
        type: DataTypes.STRING(40),
        allowNull: false,
      },
      coverImageUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isPrivate: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      modelName: "PortfolioCollection",
      tableName: "PortfolioCollections",
      timestamps: true,
    }
  );
  return PortfolioCollection;
}
