import { Sequelize } from "sequelize";

/** Columns so 24h / 1h client reminders are sent once per appointment time. */
export async function ensureAppointmentReminderColumns(
  sequelize: Sequelize
): Promise<void> {
  try {
    await sequelize.query(`
      ALTER TABLE "Appointments"
      ADD COLUMN IF NOT EXISTS "reminder24hSentAt" TIMESTAMP WITH TIME ZONE NULL;
    `);
    await sequelize.query(`
      ALTER TABLE "Appointments"
      ADD COLUMN IF NOT EXISTS "reminder1hSentAt" TIMESTAMP WITH TIME ZONE NULL;
    `);
    await sequelize.query(`
      ALTER TABLE "ExternalAppointments"
      ADD COLUMN IF NOT EXISTS "reminder24hSentAt" TIMESTAMP WITH TIME ZONE NULL;
    `);
    await sequelize.query(`
      ALTER TABLE "ExternalAppointments"
      ADD COLUMN IF NOT EXISTS "reminder1hSentAt" TIMESTAMP WITH TIME ZONE NULL;
    `);
  } catch (error) {
    console.warn("Appointment reminder columns ensure skipped:", error);
  }
}
