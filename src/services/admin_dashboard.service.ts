import { Op, QueryTypes } from "sequelize";
import sequelize from "../config/database";
import { User } from "../models/user_model";
import { Appointment } from "../models/appointment_model";

export class AdminDashboardService {
  /**
   * Dashboard KPIs for the admin portal:
   * total users, bookings, revenue, and active providers.
   */
  static async getDashboardStats() {
    const [totalUsers, totalBookings, totalRevenue, totalActiveProviders] =
      await Promise.all([
        User.count({
          where: {
            role: { [Op.ne]: "admin" },
          },
        }),
        Appointment.count(),
        this.getTotalRevenue(),
        User.count({
          where: {
            role: { [Op.in]: ["solo", "suite"] },
            status: "verified",
            isSuspended: false,
            isTeamMember: false,
          },
        }),
      ]);

    return {
      totalUsers,
      totalBookings,
      totalRevenue,
      totalActiveProviders,
    };
  }

  /**
   * Gross booking revenue from successful payments (all time).
   * Uses paid amount for fully paid bookings and deposit for partial payments.
   */
  private static async getTotalRevenue(): Promise<number> {
    const [row] = await sequelize.query<{ total: string }>(
      `SELECT COALESCE(SUM(
         CASE
           WHEN a."paymentStatus" = 'partially_paid'
             THEN COALESCE(a."depositAmount", a.price)::numeric
           WHEN a."paymentStatus" = 'paid'
             THEN a.price::numeric
           ELSE 0
         END
       ), 0) AS total
       FROM "Appointments" a
       WHERE a."deletedAt" IS NULL
         AND a."paymentStatus" IN ('paid', 'partially_paid')`,
      { type: QueryTypes.SELECT }
    );

    return Math.round(parseFloat(row?.total || "0") * 100) / 100;
  }
}
