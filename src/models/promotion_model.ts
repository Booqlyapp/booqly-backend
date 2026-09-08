import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface PromotionAttributes {
  id: string;
  providerId: string;
  name: string;
  description: string | null;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  categoryId: string | null;
  subcategoryId: string | null;
  serviceIds: string[] | null;
  usageLimit: number | null;
  usedCount: number;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
  deletedAt: CreationOptional<Date> | null;
}

export class Promotion
  extends Model<InferAttributes<Promotion>, InferCreationAttributes<Promotion>>
  implements PromotionAttributes
{
  declare id: CreationOptional<string>;
  declare providerId: string;
  declare name: string;
  declare description: string | null;
  declare discountType: "percentage" | "fixed";
  declare discountValue: number;
  declare minOrderAmount: number | null;
  declare maxDiscountAmount: number | null;
  declare categoryId: string | null;
  declare subcategoryId: string | null;
  declare serviceIds: string[] | null;
  declare usageLimit: number | null;
  declare usedCount: number;
  declare startDate: Date;
  declare endDate: Date;
  declare isActive: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date> | null;

  // Associations
  declare provider?: any;
  declare category?: any;
  declare subcategory?: any;
  declare services?: any[];
}

export default function initPromotion(sequelize: Sequelize) {
  console.log("Initializing Promotion model");
  Promotion.init(
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
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      discountType: {
        type: DataTypes.ENUM("percentage", "fixed"),
        allowNull: false,
      },
      discountValue: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      minOrderAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      maxDiscountAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      categoryId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "Categories",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      subcategoryId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "Subcategories",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      serviceIds: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        allowNull: true,
      },
      usageLimit: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      usedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      startDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
      modelName: "Promotion",
      timestamps: true,
      paranoid: true,
      indexes: [
        {
          fields: ["providerId"],
        },
        {
          fields: ["categoryId"],
        },
        {
          fields: ["subcategoryId"],
        },
        {
          fields: ["startDate", "endDate"],
        },
        {
          fields: ["isActive"],
        },
      ],
    }
  );

  return Promotion;
}
