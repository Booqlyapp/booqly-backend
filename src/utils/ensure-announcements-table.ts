import { Sequelize } from "sequelize";
import { Announcement } from "../models/announcement_model";

export async function ensureAnnouncementsTable(sequelize: Sequelize): Promise<void> {
  try {
    const [rows] = (await sequelize.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'Announcements'
      ) AS "exists";
    `)) as [Array<{ exists: boolean }>, unknown];

    if (rows?.[0]?.exists) {
      return;
    }

    await Announcement.sync();

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS "announcements_status"
        ON "Announcements" ("status");
      CREATE INDEX IF NOT EXISTS "announcements_type"
        ON "Announcements" ("type");
      CREATE INDEX IF NOT EXISTS "announcements_audience"
        ON "Announcements" ("audience");
      CREATE INDEX IF NOT EXISTS "announcements_scheduled_at"
        ON "Announcements" ("scheduledAt");
      CREATE INDEX IF NOT EXISTS "announcements_published_at"
        ON "Announcements" ("publishedAt");
    `);

    console.log("✅ Announcements table ensured");
  } catch (error) {
    console.warn("Could not ensure Announcements table:", error);
  }
}
