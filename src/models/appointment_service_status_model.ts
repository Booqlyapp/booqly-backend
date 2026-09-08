import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface AppointmentServiceStatusAttributes {
  id: string;
  appointmentId: string;
  serviceId: string;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export class AppointmentServiceStatus
  extends Model<
    InferAttributes<AppointmentServiceStatus>,
    InferCreationAttributes<AppointmentServiceStatus>
  >
  implements AppointmentServiceStatusAttributes
{
  declare id: CreationOptional<string>;
  declare appointmentId: string;
  declare serviceId: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export default function initAppointmentServiceStatus(sequelize: Sequelize) {
  console.log("Initializing AppointmentServiceStatus model (junction)");
  AppointmentServiceStatus.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      appointmentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Appointments",
          key: "id",
        },
      },
      serviceId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Services",
          key: "id",
        },
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "AppointmentServiceStatus",
      tableName: "AppointmentServiceStatuses", // Plural table name
      timestamps: true,
    }
  );

  return AppointmentServiceStatus;
}
