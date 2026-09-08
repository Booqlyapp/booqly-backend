import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface ExternalAppointmentServiceAttributes {
  id: string;
  externalAppointmentId: string;
  serviceId: string;
  price: number;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export class ExternalAppointmentService
  extends Model<
    InferAttributes<ExternalAppointmentService>,
    InferCreationAttributes<ExternalAppointmentService>
  >
  implements ExternalAppointmentServiceAttributes
{
  declare id: CreationOptional<string>;
  declare externalAppointmentId: string;
  declare serviceId: string;
  declare price: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function initExternalAppointmentService(sequelize: Sequelize) {
  console.log("Initializing ExternalAppointmentService model");
  ExternalAppointmentService.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      externalAppointmentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "ExternalAppointments",
          key: "id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      serviceId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Services",
          key: "id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
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
      tableName: "ExternalAppointmentServices",
      timestamps: true,
      paranoid: false,
    }
  );

  return ExternalAppointmentService;
}
