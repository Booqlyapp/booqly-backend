import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

// Appointment Attributes
interface AppointmentAttributes {
  id: string;
  userId: string;
  marketplaceId: string;
  serviceId: string;
  paymentStatus: string | null;
  paymentMethod?: "apple_pay" | "stripe_card" | "paypal" | "cash" | "other" | null;
  status: "pending" | "canceled" | "postponed" | "availed" | "no_show";
  dateTime: Date;
  price: number;
  depositAmount?: number;
  remainingBalance?: number;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
  deletedAt: CreationOptional<Date> | null;
}

export class Appointment
  extends Model<
    InferAttributes<Appointment>,
    InferCreationAttributes<Appointment>
  >
  implements AppointmentAttributes
{
  declare id: CreationOptional<string>;
  declare userId: string;
  declare marketplaceId: string;
  declare serviceId: string;
  declare paymentStatus: "pending" | "paid" | "failed" | "refunded" | "partially_paid";
  declare paymentMethod?: "apple_pay" | "stripe_card" | "paypal" | "cash" | "other" | null;
  declare status: "pending" | "canceled" | "postponed" | "availed" | "no_show";
  declare dateTime: Date;
  declare price: number;
  declare depositAmount?: number;
  declare remainingBalance?: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date> | null;
}

export default function initAppointment(sequelize: Sequelize) {
  console.log("Initializing Appointment model");
  Appointment.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Users", // Assuming your User model table name
          key: "id",
        },
      },
      marketplaceId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Marketplaces",
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
      paymentStatus: {
        type: DataTypes.ENUM("pending", "paid", "failed", "refunded", "partially_paid"),
        allowNull: false,
        defaultValue: "pending",
      },
      paymentMethod: {
        type: DataTypes.ENUM("apple_pay", "stripe_card", "paypal", "cash", "other"),
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("pending", "canceled", "postponed", "availed", "no_show"),
        allowNull: false,
        defaultValue: "pending",
      },
      dateTime: {
        type: DataTypes.DATE,
        allowNull: false, // Required for appointment scheduling
      },
      price: {
        type: DataTypes.DECIMAL(10, 2), // e.g., 50.00
        allowNull: false,
      },
      depositAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      remainingBalance: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Appointment",
      tableName: "Appointments", // Explicit table name
      timestamps: true,
      paranoid: true, // Enable soft deletes
    }
  );

  return Appointment;
}
