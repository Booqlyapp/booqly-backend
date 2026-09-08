import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

// Schedule Attributes
interface ScheduleAttributes {
  id: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
  deletedAt: CreationOptional<Date> | null;
}

export class Schedule
  extends Model<InferAttributes<Schedule>, InferCreationAttributes<Schedule>>
  implements ScheduleAttributes
{
  declare id: CreationOptional<string>;
  declare monday: string;
  declare tuesday: string;
  declare wednesday: string;
  declare thursday: string;
  declare friday: string;
  declare saturday: string;
  declare sunday: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date> | null;
}

export default function initSchedule(sequelize: Sequelize) {
  console.log("Initializing Schedule model");
  Schedule.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      monday: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      tuesday: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      wednesday: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      thursday: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      friday: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      saturday: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      sunday: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false, // FIXED: Aligned with migration (was true)
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false, // FIXED: Aligned with migration (was true)
        defaultValue: DataTypes.NOW,
      },
      deletedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Schedule",
      timestamps: true,
      paranoid: true,
    }
  );

  return Schedule;
}
