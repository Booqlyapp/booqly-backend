import { DataTypes, Model, Sequelize } from "sequelize";

export interface LogAttributes {
  id: string;
  level: number;
  levelName: string;
  time: number;
  pid?: number;
  hostname?: string;
  reqId?: string;
  userId?: string;
  method?: string;
  url?: string;
  statusCode?: number;
  responseTime?: number;
  userAgent?: string;
  ip?: string;
  msg: string;
  module?: string;
  action?: string;
  metadata?: any;
  error?: any;
  createdAt: Date;
  updatedAt: Date;
}

export class Log extends Model<LogAttributes> implements LogAttributes {
  public id!: string;
  public level!: number;
  public levelName!: string;
  public time!: number;
  public pid?: number;
  public hostname?: string;
  public reqId?: string;
  public userId?: string;
  public method?: string;
  public url?: string;
  public statusCode?: number;
  public responseTime?: number;
  public userAgent?: string;
  public ip?: string;
  public msg!: string;
  public module?: string;
  public action?: string;
  public metadata?: any;
  public error?: any;
  public createdAt!: Date;
  public updatedAt!: Date;
}

export default function initLog(sequelize: Sequelize) {
  console.log("Initializing Log model");
  Log.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      level: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      levelName: {
        type: DataTypes.STRING(10),
        allowNull: false,
      },
      time: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      pid: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      hostname: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      reqId: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      method: {
        type: DataTypes.STRING(10),
        allowNull: true,
      },
      url: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      statusCode: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      responseTime: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      userAgent: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      ip: {
        type: DataTypes.STRING(45),
        allowNull: true,
      },
      msg: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      module: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      action: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      error: {
        type: DataTypes.JSONB,
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
    },
    {
      sequelize,
      modelName: "Log",
      tableName: "Logs",
      timestamps: true,
      paranoid: false,
      indexes: [
        { fields: ["level"] },
        { fields: ["time"] },
        { fields: ["reqId"] },
        { fields: ["userId"] },
        { fields: ["statusCode"] },
        { fields: ["ip"] },
        { fields: ["module", "action"] },
        { fields: ["createdAt"] },
      ],
    }
  );

  return Log;
}
