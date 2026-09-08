import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface ExternalAppointmentAddOnAttributes {
  id: string;
  externalAppointmentServiceId: string;
  serviceAddOnId: string;
  title: string;
  price: number;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export class ExternalAppointmentAddOn
  extends Model<
    InferAttributes<ExternalAppointmentAddOn>,
    InferCreationAttributes<ExternalAppointmentAddOn>
  >
  implements ExternalAppointmentAddOnAttributes
{
  declare id: CreationOptional<string>;
  declare externalAppointmentServiceId: string;
  declare serviceAddOnId: string;
  declare title: string;
  declare price: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function initExternalAppointmentAddOn(sequelize: Sequelize) {
  console.log("Initializing ExternalAppointmentAddOn model");
  ExternalAppointmentAddOn.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      externalAppointmentServiceId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "ExternalAppointmentServices",
          key: "id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      serviceAddOnId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "ServiceAddOns",
          key: "id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
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
    },
    {
      sequelize,
      tableName: "ExternalAppointmentAddOns",
      timestamps: true,
      paranoid: false,
    }
  );

  return ExternalAppointmentAddOn;
}
