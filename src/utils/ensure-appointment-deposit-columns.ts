import { Sequelize } from "sequelize";

/** Columns for provider/owner manual booking deposit hold + waive. */
export async function ensureAppointmentDepositColumns(
  sequelize: Sequelize
): Promise<void> {
  try {
    await sequelize.query(`
      ALTER TABLE "Appointments"
      ADD COLUMN IF NOT EXISTS "depositExpiresAt" TIMESTAMP WITH TIME ZONE NULL;
    `);
    await sequelize.query(`
      ALTER TABLE "Appointments"
      ADD COLUMN IF NOT EXISTS "depositWaived" BOOLEAN NOT NULL DEFAULT false;
    `);
  } catch (error) {
    console.warn("Appointment deposit columns ensure skipped:", error);
  }
}
