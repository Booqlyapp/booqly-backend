import { Sequelize } from "sequelize";
import { ReviewFlag } from "../models/review_flag_model";

export async function ensureReviewFlagsTable(sequelize: Sequelize): Promise<void> {
  try {
    const [rows] = (await sequelize.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'ReviewFlags'
      ) AS "exists";
    `)) as [Array<{ exists: boolean }>, unknown];

    if (rows?.[0]?.exists) {
      return;
    }

    await ReviewFlag.sync();

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "review_flags_review_id"
        ON "ReviewFlags" ("reviewId");
      CREATE INDEX IF NOT EXISTS "review_flags_flagged_by_id"
        ON "ReviewFlags" ("flaggedById");
      CREATE INDEX IF NOT EXISTS "review_flags_status"
        ON "ReviewFlags" ("status");
      CREATE UNIQUE INDEX IF NOT EXISTS "review_flags_unique_per_user_direction"
        ON "ReviewFlags" ("reviewId", "flaggedById", "reviewDirection");
    `);

    console.log("✅ ReviewFlags table ensured");
  } catch (error) {
    console.warn("Could not ensure ReviewFlags table:", error);
  }
}
