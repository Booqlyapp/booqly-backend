import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
  BelongsToGetAssociationMixin,
  BelongsToSetAssociationMixin,
  Association,
} from "sequelize";

// ServiceAddOn Attributes
interface ServiceAddOnAttributes {
  id: string;
  serviceId: string;
  title: string;
  price: number;
  isActive: boolean;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
  deletedAt: CreationOptional<Date> | null;
}

export class ServiceAddOn
  extends Model<InferAttributes<ServiceAddOn>, InferCreationAttributes<ServiceAddOn>>
  implements ServiceAddOnAttributes
{
  declare id: CreationOptional<string>;
  declare serviceId: string;
  declare title: string;
  declare price: number;
  declare isActive: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date> | null;

  // Association methods
  declare getService: BelongsToGetAssociationMixin<any>;
  declare setService: BelongsToSetAssociationMixin<any, string>;

  // Associations
  declare service?: any;

  declare static associations: {
    service: Association<ServiceAddOn, any>;
  };
}

export default function initServiceAddOn(sequelize: Sequelize) {
  console.log("Initializing ServiceAddOn model");
  ServiceAddOn.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      serviceId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Services",
          key: "id",
        },
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
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
      modelName: "ServiceAddOn",
      timestamps: true,
      paranoid: true,
    }
  );

  return ServiceAddOn;
}
