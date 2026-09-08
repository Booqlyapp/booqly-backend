import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
  BelongsToGetAssociationMixin,
  BelongsToSetAssociationMixin,
  HasManyGetAssociationsMixin,
  HasManySetAssociationsMixin,
  HasManyAddAssociationMixin,
  HasManyRemoveAssociationMixin,
  Association,
} from "sequelize";

// Service Attributes
interface ServiceAttributes {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  categoryId?: string;
  subcategoryId?: string;
  description: string;
  price: number;
  duration: string;
  marketplaceId: string;
  isActive: boolean;
  requireDeposit: boolean;
  depositType?: 'fixed' | 'percentage';
  depositAmount?: number;
  imageUrl?: string;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
  deletedAt: CreationOptional<Date> | null;
}

export class Service
  extends Model<InferAttributes<Service>, InferCreationAttributes<Service>>
  implements ServiceAttributes
{
  declare id: CreationOptional<string>;
  declare name: string;
  declare category: string;
  declare subcategory?: string;
  declare categoryId?: string;
  declare subcategoryId?: string;
  declare description: string;
  declare price: number;
  declare duration: string;
  declare marketplaceId: string;
  declare isActive: boolean;
  declare requireDeposit: boolean;
  declare depositType?: 'fixed' | 'percentage';
  declare depositAmount?: number;
  declare imageUrl?: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date> | null;

  // Association methods
  declare getCategory: BelongsToGetAssociationMixin<any>;
  declare setCategory: BelongsToSetAssociationMixin<any, string>;
  declare getSubcategory: BelongsToGetAssociationMixin<any>;
  declare setSubcategory: BelongsToSetAssociationMixin<any, string>;
  declare getAddOns: HasManyGetAssociationsMixin<any>;
  declare setAddOns: HasManySetAssociationsMixin<any, string>;
  declare addAddOn: HasManyAddAssociationMixin<any, string>;
  declare removeAddOn: HasManyRemoveAssociationMixin<any, string>;

  // Associations
  declare categoryModel?: any;
  declare subcategoryModel?: any;
  declare addOns?: any[];

  declare static associations: {
    categoryModel: Association<Service, any>;
    subcategoryModel: Association<Service, any>;
    addOns: Association<Service, any>;
  };
}

export default function initService(sequelize: Sequelize) {
  console.log("Initializing Service model");
  Service.init(
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
      category: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      subcategory: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      categoryId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "Categories",
          key: "id",
        },
      },
      subcategoryId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "Subcategories",
          key: "id",
        },
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      duration: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      marketplaceId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Marketplaces",
          key: "id",
        },
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      requireDeposit: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      depositType: {
        type: DataTypes.ENUM('fixed', 'percentage'),
        allowNull: true,
      },
      depositAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      imageUrl: {
        type: DataTypes.STRING,
        allowNull: true,
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
      modelName: "Service",
      timestamps: true,
      paranoid: true,
    }
  );

  return Service;
}
