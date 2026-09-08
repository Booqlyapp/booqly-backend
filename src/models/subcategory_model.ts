import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
  BelongsToGetAssociationMixin,
  BelongsToSetAssociationMixin,
  BelongsToCreateAssociationMixin,
  Association,
} from "sequelize";

// Subcategory Attributes
interface SubcategoryAttributes {
  id: string;
  name: string;
  description?: string;
  categoryId: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
  deletedAt: CreationOptional<Date> | null;
}

export class Subcategory
  extends Model<InferAttributes<Subcategory>, InferCreationAttributes<Subcategory>>
  implements SubcategoryAttributes
{
  declare id: CreationOptional<string>;
  declare name: string;
  declare description?: string;
  declare categoryId: string;
  declare isActive: boolean;
  declare sortOrder: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date> | null;

  // Association methods
  declare getCategory: BelongsToGetAssociationMixin<any>;
  declare setCategory: BelongsToSetAssociationMixin<any, string>;
  declare createCategory: BelongsToCreateAssociationMixin<any>;

  // Associations
  declare category?: any;

  declare static associations: {
    category: Association<Subcategory, any>;
  };
}

export default function initSubcategory(sequelize: Sequelize) {
  console.log("Initializing Subcategory model");
  Subcategory.init(
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
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      categoryId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Categories",
          key: "id",
        },
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
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
      modelName: "Subcategory",
      timestamps: true,
      paranoid: true,
      indexes: [
        {
          unique: true,
          fields: ["categoryId", "name"],
          name: "unique_subcategory_per_category",
        },
      ],
    }
  );

  return Subcategory;
}
