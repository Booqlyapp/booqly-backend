import { Sequelize } from "sequelize";

const ENUM_UPDATES = [
  `ALTER TYPE "enum_Messages_messageType" ADD VALUE IF NOT EXISTS 'reel';`,
  `ALTER TYPE "enum_Messages_messageType" ADD VALUE IF NOT EXISTS 'video';`,
  `ALTER TYPE "enum_Notifications_type" ADD VALUE IF NOT EXISTS 'review_response';`,
  `ALTER TYPE "enum_Notifications_type" ADD VALUE IF NOT EXISTS 'professional_verified';`,
  `ALTER TYPE "enum_Notifications_type" ADD VALUE IF NOT EXISTS 'professional_rejected';`,
  `ALTER TYPE "enum_Notifications_type" ADD VALUE IF NOT EXISTS 'business_verified';`,
  `ALTER TYPE "enum_Notifications_type" ADD VALUE IF NOT EXISTS 'business_rejected';`,
];

export async function ensureDatabaseEnums(sequelize: Sequelize): Promise<void> {
  for (const sql of ENUM_UPDATES) {
    try {
      await sequelize.query(sql);
    } catch (error) {
      console.warn("Enum update skipped:", error);
    }
  }
}
