import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
  HasManyGetAssociationsMixin,
  HasManyAddAssociationMixin,
  HasManyCreateAssociationMixin,
  Association,
} from "sequelize";

// Category Attributes
interface CategoryAttributes {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
  deletedAt: CreationOptional<Date> | null;
}

export class Category
  extends Model<InferAttributes<Category>, InferCreationAttributes<Category>>
  implements CategoryAttributes
{
  declare id: CreationOptional<string>;
  declare name: string;
  declare description?: string;
  declare isActive: boolean;
  declare sortOrder: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date> | null;

  // Association methods
  declare getSubcategories: HasManyGetAssociationsMixin<any>;
  declare addSubcategory: HasManyAddAssociationMixin<any, string>;
  declare createSubcategory: HasManyCreateAssociationMixin<any>;

  // Associations
  declare subcategories?: any[];

  declare static associations: {
    subcategories: Association<Category, any>;
  };
}

export default function initCategory(sequelize: Sequelize) {
  console.log("Initializing Category model");
  Category.init(
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
        unique: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
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
      modelName: "Category",
      timestamps: true,
      paranoid: true,
    }
  );

  return Category;
}
