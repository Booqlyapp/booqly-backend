import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface ServiceData {
  serviceId: string;
  serviceName: string;
  price: number;
  addOns?: Array<{
    id: string;
    title: string;
    price: number;
  }>;
}

interface ExternalAppointmentAttributes {
  id: string;
  marketplaceId: string;
  assignedTeamMemberId?: string | null;
  servicesData: ServiceData[];
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateTime: Date;
  status: "pending" | "confirmed" | "canceled" | "completed";
  price: number;
  depositAmount?: number;
  remainingBalance?: number;
  depositPaid: boolean;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  depositPaidAt?: Date;
  acceptedTerms: boolean;
  marketingConsent: boolean;
  notes?: string;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
  deletedAt: CreationOptional<Date> | null;
}

export class ExternalAppointment
  extends Model<
    InferAttributes<ExternalAppointment>,
    InferCreationAttributes<ExternalAppointment>
  >
  implements ExternalAppointmentAttributes
{
  declare id: CreationOptional<string>;
  declare marketplaceId: string;
  declare assignedTeamMemberId: string | null;
  declare servicesData: ServiceData[];
  declare firstName: string;
  declare lastName: string;
  declare email: string;
  declare phone: string;
  declare dateTime: Date;
  declare status: "pending" | "confirmed" | "canceled" | "completed";
  declare price: number;
  declare depositAmount?: number;
  declare remainingBalance?: number;
  declare depositPaid: boolean;
  declare stripePaymentIntentId?: string;
  declare stripeChargeId?: string;
  declare depositPaidAt?: Date;
  declare acceptedTerms: boolean;
  declare marketingConsent: boolean;
  declare notes?: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date> | null;
}

export default function initExternalAppointment(sequelize: Sequelize) {
  console.log("Initializing ExternalAppointment model");
  ExternalAppointment.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      marketplaceId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Marketplaces",
          key: "id",
        },
      },
      assignedTeamMemberId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      servicesData: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      firstName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      lastName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isEmail: true,
        },
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      dateTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("pending", "confirmed", "canceled", "completed"),
        allowNull: false,
        defaultValue: "pending",
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
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
      depositPaid: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      stripePaymentIntentId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      stripeChargeId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      depositPaidAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      acceptedTerms: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      marketingConsent: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      notes: {
        type: DataTypes.TEXT,
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
      modelName: "ExternalAppointment",
      tableName: "ExternalAppointments",
      timestamps: true,
      paranoid: true,
    }
  );

  return ExternalAppointment;
}
