import { Sequelize } from "sequelize";
import { ContentReport } from "../models/content_report_model";

export async function ensureContentReportsTable(sequelize: Sequelize): Promise<void> {
  try {
    await sequelize.query(`
      ALTER TABLE "Users"
      ADD COLUMN IF NOT EXISTS "isSuspended" BOOLEAN NOT NULL DEFAULT false;
    `);
    await sequelize.query(`
      ALTER TABLE "Users"
      ADD COLUMN IF NOT EXISTS "warningCount" INTEGER NOT NULL DEFAULT 0;
    `);

    const [rows] = (await sequelize.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'ContentReports'
      ) AS "exists";
    `)) as [Array<{ exists: boolean }>, unknown];

    if (rows?.[0]?.exists) {
      return;
    }

    await ContentReport.sync();

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "content_reports_status"
        ON "ContentReports" ("status");
      CREATE INDEX IF NOT EXISTS "content_reports_content_type"
        ON "ContentReports" ("contentType");
      CREATE INDEX IF NOT EXISTS "content_reports_reason"
        ON "ContentReports" ("reason");
      CREATE INDEX IF NOT EXISTS "content_reports_reporter_item"
        ON "ContentReports" ("reporterId", "contentType", "contentId");
    `);

    console.log("✅ ContentReports table ensured");
  } catch (error) {
    console.warn("Could not ensure ContentReports table:", error);
  }
}
