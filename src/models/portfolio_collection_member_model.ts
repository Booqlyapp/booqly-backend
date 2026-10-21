import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class PortfolioCollectionMember
  extends Model<
    InferAttributes<PortfolioCollectionMember>,
    InferCreationAttributes<PortfolioCollectionMember>
  >
{
  declare id: CreationOptional<string>;
  declare collectionId: string;
  declare userId: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function initPortfolioCollectionMember(sequelize: Sequelize) {
  PortfolioCollectionMember.init(
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
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "Users", key: "id" },
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      sequelize,
      modelName: "PortfolioCollectionMember",
      tableName: "PortfolioCollectionMembers",
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ["collectionId", "userId"],
          name: "pcm_collection_user_unique",
        },
      ],
    }
  );
  return PortfolioCollectionMember;
}
