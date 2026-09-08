import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

interface WaitlistAttributes {
  id: string;
  marketplaceId: string;
  clientUserId: string;
  dateTime: Date;
  note: string | null;
  status: "waiting" | "notified" | "claimed" | "filled" | "expired" | "cancelled";
  notifiedAt: Date | null;
  claimExpiresAt: Date | null;
  claimedAt: Date | null;
  fulfilledAppointmentId: string | null;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
  deletedAt: CreationOptional<Date> | null;
}

export class Waitlist
  extends Model<InferAttributes<Waitlist>, InferCreationAttributes<Waitlist>>
  implements WaitlistAttributes
{
  declare id: CreationOptional<string>;
  declare marketplaceId: string;
  declare clientUserId: string;
  declare dateTime: Date;
  declare note: string | null;
  declare status: "waiting" | "notified" | "claimed" | "filled" | "expired" | "cancelled";
  declare notifiedAt: Date | null;
  declare claimExpiresAt: Date | null;
  declare claimedAt: Date | null;
  declare fulfilledAppointmentId: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date> | null;
}

export default function initWaitlist(sequelize: Sequelize) {
  console.log("Initializing Waitlist model");

  Waitlist.init(
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
      clientUserId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
      },
      dateTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM("waiting", "notified", "claimed", "filled", "expired", "cancelled"),
        allowNull: false,
        defaultValue: "waiting",
      },
      notifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      claimExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      claimedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      fulfilledAppointmentId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "Appointments",
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
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Waitlist",
      tableName: "Waitlists",
      timestamps: true,
      paranoid: true,
    }
  );

  return Waitlist;
}
