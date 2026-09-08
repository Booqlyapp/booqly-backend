import { Op, QueryTypes } from 'sequelize';
import Stripe from 'stripe';
import sequelize from '../config/database';
import { Appointment } from '../models/appointment_model';
import { ExternalAppointment } from '../models/external_appointment_model';
import { User } from '../models/user_model';
import { Marketplace } from '../models/marketplace_model';
import { StripeService } from './stripe.service';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export interface DateRange {
  startDate: Date;
  endDate: Date;
  previousStartDate: Date;
  previousEndDate: Date;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  apple_pay: 'Apple Pay',
  stripe_card: 'Stripe (Card)',
  paypal: 'PayPal',
  cash: 'Cash',
  other: 'Other',
};

export class AdminPaymentService {
  static readonly COMMISSION_RATE = StripeService.PLATFORM_FEE_PERCENT;

  static parseDateRange(startDate?: string, endDate?: string): DateRange {
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const start = startDate ? new Date(startDate) : new Date(end);
    if (!startDate) {
      start.setDate(start.getDate() - 30);
    }
    start.setHours(0, 0, 0, 0);

    const periodMs = end.getTime() - start.getTime();
    const previousEndDate = new Date(start.getTime() - 1);
    previousEndDate.setHours(23, 59, 59, 999);
    const previousStartDate = new Date(previousEndDate.getTime() - periodMs);
    previousStartDate.setHours(0, 0, 0, 0);

    return { startDate: start, endDate: end, previousStartDate, previousEndDate };
  }

  static roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  static calcPercentChange(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return this.roundMoney(((current - previous) / previous) * 100);
  }

  private static paidAmountSql(alias = 'a'): string {
    return `CASE
      WHEN ${alias}."paymentStatus" = 'partially_paid'
        THEN COALESCE(${alias}."depositAmount", ${alias}.price)
      ELSE ${alias}.price
    END`;
  }

  private static async getAppointmentPaymentStats(start: Date, end: Date) {
    const paidAmount = this.paidAmountSql('a');

    const [row] = await sequelize.query<{
      grossPayments: string;
      commission: string;
      successfulPayments: string;
      failedPayments: string;
      refundedAmount: string;
    }>(
      `SELECT
        COALESCE(SUM(CASE WHEN a."paymentStatus" IN ('paid', 'partially_paid') THEN (${paidAmount})::numeric ELSE 0 END), 0) AS "grossPayments",
        COALESCE(SUM(CASE WHEN a."paymentStatus" IN ('paid', 'partially_paid') THEN (${paidAmount})::numeric * :commissionRate ELSE 0 END), 0) AS "commission",
        COALESCE(SUM(CASE WHEN a."paymentStatus" IN ('paid', 'partially_paid') THEN 1 ELSE 0 END), 0) AS "successfulPayments",
        COALESCE(SUM(CASE WHEN a."paymentStatus" = 'failed' THEN 1 ELSE 0 END), 0) AS "failedPayments",
        COALESCE(SUM(CASE WHEN a."paymentStatus" = 'refunded' THEN a.price::numeric ELSE 0 END), 0) AS "refundedAmount"
      FROM "Appointments" a
      WHERE a."deletedAt" IS NULL
        AND a."createdAt" BETWEEN :start AND :end`,
      {
        replacements: { start, end, commissionRate: this.COMMISSION_RATE },
        type: QueryTypes.SELECT,
      }
    );

    const externalGross = await ExternalAppointment.sum('depositAmount', {
      where: {
        depositPaid: true,
        depositPaidAt: { [Op.between]: [start, end] },
      },
    });

    const externalCount = await ExternalAppointment.count({
      where: {
        depositPaid: true,
        depositPaidAt: { [Op.between]: [start, end] },
      },
    });

    const grossPayments = parseFloat(row?.grossPayments || '0') + Number(externalGross || 0);
    const commission =
      parseFloat(row?.commission || '0') +
      Number(externalGross || 0) * this.COMMISSION_RATE;

    return {
      grossPayments,
      commission,
      successfulPayments: parseInt(row?.successfulPayments || '0', 10) + externalCount,
      failedPayments: parseInt(row?.failedPayments || '0', 10),
      refundedAmount: parseFloat(row?.refundedAmount || '0'),
    };
  }

  static async getSummary(startDate?: string, endDate?: string) {
    const range = this.parseDateRange(startDate, endDate);

    const [current, previous] = await Promise.all([
      this.getAppointmentPaymentStats(range.startDate, range.endDate),
      this.getAppointmentPaymentStats(range.previousStartDate, range.previousEndDate),
    ]);

    return {
      dateRange: {
        startDate: range.startDate.toISOString(),
        endDate: range.endDate.toISOString(),
      },
      totalGrossPayments: this.roundMoney(current.grossPayments),
      totalGrossPaymentsChange: this.calcPercentChange(current.grossPayments, previous.grossPayments),
      totalCommission: this.roundMoney(current.commission),
      totalCommissionChange: this.calcPercentChange(current.commission, previous.commission),
      commissionRate: this.COMMISSION_RATE,
      successfulPayments: current.successfulPayments,
      successfulPaymentsChange: this.calcPercentChange(
        current.successfulPayments,
        previous.successfulPayments
      ),
      failedPayments: current.failedPayments,
      failedPaymentsChange: this.calcPercentChange(current.failedPayments, previous.failedPayments),
      refundedAmount: this.roundMoney(current.refundedAmount),
      refundedAmountChange: this.calcPercentChange(current.refundedAmount, previous.refundedAmount),
    };
  }

  static async getCommissionByCategory(startDate?: string, endDate?: string) {
    const range = this.parseDateRange(startDate, endDate);
    const paidAmount = this.paidAmountSql('a');

    const rows = await sequelize.query<{
      category: string;
      commission: string;
    }>(
      `SELECT
        COALESCE(c.name, s.category, 'Other') AS category,
        COALESCE(SUM((${paidAmount})::numeric * :commissionRate), 0) AS commission
      FROM "Appointments" a
      JOIN "Services" s ON a."serviceId" = s.id
      LEFT JOIN "Categories" c ON s."categoryId" = c.id
      WHERE a."deletedAt" IS NULL
        AND a."paymentStatus" IN ('paid', 'partially_paid')
        AND a."createdAt" BETWEEN :start AND :end
      GROUP BY COALESCE(c.name, s.category, 'Other')
      ORDER BY commission DESC`,
      {
        replacements: {
          start: range.startDate,
          end: range.endDate,
          commissionRate: this.COMMISSION_RATE,
        },
        type: QueryTypes.SELECT,
      }
    );

    const breakdown = rows.map((row) => ({
      category: row.category,
      amount: this.roundMoney(parseFloat(row.commission)),
    }));

    const totalCommission = breakdown.reduce((sum, item) => sum + item.amount, 0);

    return {
      totalCommission: this.roundMoney(totalCommission),
      breakdown: breakdown.map((item) => ({
        category: item.category,
        amount: item.amount,
        percentage:
          totalCommission > 0
            ? this.roundMoney((item.amount / totalCommission) * 100)
            : 0,
      })),
    };
  }

  static async getCommissionByPaymentMethod(startDate?: string, endDate?: string) {
    const range = this.parseDateRange(startDate, endDate);
    const paidAmount = this.paidAmountSql('a');

    const rows = await sequelize.query<{
      paymentMethod: string;
      commission: string;
    }>(
      `SELECT
        COALESCE(a."paymentMethod", 'stripe_card') AS "paymentMethod",
        COALESCE(SUM((${paidAmount})::numeric * :commissionRate), 0) AS commission
      FROM "Appointments" a
      WHERE a."deletedAt" IS NULL
        AND a."paymentStatus" IN ('paid', 'partially_paid')
        AND a."createdAt" BETWEEN :start AND :end
      GROUP BY COALESCE(a."paymentMethod", 'stripe_card')
      ORDER BY commission DESC`,
      {
        replacements: {
          start: range.startDate,
          end: range.endDate,
          commissionRate: this.COMMISSION_RATE,
        },
        type: QueryTypes.SELECT,
      }
    );

    const breakdown = rows.map((row) => ({
      method: row.paymentMethod,
      label: PAYMENT_METHOD_LABELS[row.paymentMethod] || row.paymentMethod,
      amount: this.roundMoney(parseFloat(row.commission)),
    }));

    const totalCommission = breakdown.reduce((sum, item) => sum + item.amount, 0);

    return {
      totalCommission: this.roundMoney(totalCommission),
      breakdown: breakdown.map((item) => ({
        method: item.method,
        label: item.label,
        amount: item.amount,
        percentage:
          totalCommission > 0
            ? this.roundMoney((item.amount / totalCommission) * 100)
            : 0,
      })),
    };
  }

  static async getTopClients(startDate?: string, endDate?: string, limit = 10) {
    const range = this.parseDateRange(startDate, endDate);
    const paidAmount = this.paidAmountSql('a');

    const rows = await sequelize.query<{
      userId: string;
      name: string;
      profilePic: string | null;
      totalSpent: string;
      appointments: string;
    }>(
      `SELECT
        u.id AS "userId",
        u.name,
        u."profilePic",
        COALESCE(SUM((${paidAmount})::numeric), 0) AS "totalSpent",
        COUNT(a.id) AS appointments
      FROM "Appointments" a
      JOIN "Users" u ON a."userId" = u.id
      WHERE a."deletedAt" IS NULL
        AND u."deletedAt" IS NULL
        AND u.role = 'client'
        AND a."paymentStatus" IN ('paid', 'partially_paid')
        AND a."createdAt" BETWEEN :start AND :end
      GROUP BY u.id, u.name, u."profilePic"
      ORDER BY "totalSpent" DESC
      LIMIT :limit`,
      {
        replacements: {
          start: range.startDate,
          end: range.endDate,
          limit,
        },
        type: QueryTypes.SELECT,
      }
    );

    return {
      clients: rows.map((row) => ({
        id: row.userId,
        name: row.name,
        profilePic: row.profilePic,
        totalSpent: this.roundMoney(parseFloat(row.totalSpent)),
        appointments: parseInt(row.appointments, 10),
      })),
    };
  }

  static async getStripeConnectStatus(page = 1, limit = 10, search?: string) {
    const pageNum = page;
    const limitNum = Math.min(limit, 100);
    const offset = (pageNum - 1) * limitNum;

    const where: any = {
      role: { [Op.in]: ['solo', 'suite'] },
    };

    if (search) {
      const term = `%${search}%`;
      where[Op.or] = [
        { name: { [Op.iLike]: term } },
        { businessName: { [Op.iLike]: term } },
        { email: { [Op.iLike]: term } },
      ];
    }

    const { count, rows: providers } = await User.findAndCountAll({
      where,
      attributes: [
        'id',
        'name',
        'businessName',
        'profilePic',
        'email',
        'stripeConnectAccountId',
        'stripeConnectChargesEnabled',
        'stripeConnectPayoutsEnabled',
        'stripeConnectDetailsSubmitted',
        'updatedAt',
      ],
      order: [['updatedAt', 'DESC']],
      limit: limitNum,
      offset,
    });

    return {
      providers: providers.map((provider) => {
        const isConnected =
          !!provider.stripeConnectAccountId &&
          provider.stripeConnectChargesEnabled &&
          provider.stripeConnectPayoutsEnabled;

        const isPending =
          !!provider.stripeConnectAccountId &&
          !isConnected;

        let status: 'connected' | 'pending' | 'not_started';
        if (isConnected) {
          status = 'connected';
        } else if (isPending || provider.stripeConnectDetailsSubmitted) {
          status = 'pending';
        } else {
          status = 'not_started';
        }

        return {
          id: provider.id,
          name: provider.name || provider.businessName,
          profilePic: provider.profilePic,
          email: provider.email,
          status,
          chargesEnabled: provider.stripeConnectChargesEnabled,
          payoutsEnabled: provider.stripeConnectPayoutsEnabled,
          detailsSubmitted: provider.stripeConnectDetailsSubmitted,
          lastUpdated: provider.updatedAt,
        };
      }),
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(count / limitNum),
        totalItems: count,
        itemsPerPage: limitNum,
      },
    };
  }

  static async getRecentPayouts(page = 1, limit = 10) {
    const pageNum = page;
    const limitNum = Math.min(limit, 100);

    const providers = await User.findAll({
      where: {
        stripeConnectAccountId: { [Op.ne]: null },
      },
      attributes: ['id', 'name', 'businessName', 'profilePic', 'stripeConnectAccountId'],
    });

    if (providers.length === 0) {
      return {
        payouts: [],
        pagination: {
          currentPage: pageNum,
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: limitNum,
        },
      };
    }

    const accountMap = new Map(
      providers.map((p) => [p.stripeConnectAccountId!, p])
    );

    const allPayouts: Array<{
      id: string;
      provider: { id: string; name: string | null; profilePic: string | null };
      amount: number;
      status: 'paid' | 'pending';
      date: Date;
      currency: string;
    }> = [];

    await Promise.all(
      providers.map(async (provider) => {
        try {
          const payouts = await stripe.payouts.list(
            { limit: 10 },
            { stripeAccount: provider.stripeConnectAccountId! }
          );

          for (const payout of payouts.data) {
            allPayouts.push({
              id: payout.id,
              provider: {
                id: provider.id,
                name: provider.name || provider.businessName,
                profilePic: provider.profilePic,
              },
              amount: this.roundMoney(payout.amount / 100),
              status: payout.status === 'paid' ? 'paid' : 'pending',
              date: new Date(payout.created * 1000),
              currency: payout.currency.toUpperCase(),
            });
          }
        } catch (error) {
          console.error(
            `Failed to fetch payouts for provider ${provider.id}:`,
            error
          );
        }
      })
    );

    // Fallback: derive pending provider earnings when Stripe returns no payouts
    if (allPayouts.length === 0) {
      const derived = await this.getDerivedProviderPayouts(accountMap);
      allPayouts.push(...derived);
    }

    allPayouts.sort((a, b) => b.date.getTime() - a.date.getTime());

    const totalItems = allPayouts.length;
    const offset = (pageNum - 1) * limitNum;
    const payouts = allPayouts.slice(offset, offset + limitNum);

    return {
      payouts,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalItems / limitNum),
        totalItems,
        itemsPerPage: limitNum,
      },
    };
  }

  /**
   * Fallback when Stripe payout history is unavailable: show recent provider
   * net earnings from paid appointments as pending payouts.
   */
  private static async getDerivedProviderPayouts(
    accountMap: Map<string, User>
  ) {
    const marketplaces = await Marketplace.findAll({
      where: { userId: { [Op.in]: [...accountMap.values()].map((p) => p.id) } },
      attributes: ['id', 'userId'],
    });

    const marketplaceToProvider = new Map(
      marketplaces.map((m) => [m.id, m.userId!])
    );

    const paidAppointments = await Appointment.findAll({
      where: {
        paymentStatus: { [Op.in]: ['paid', 'partially_paid'] },
        marketplaceId: { [Op.in]: marketplaces.map((m) => m.id) },
      },
      attributes: ['id', 'marketplaceId', 'price', 'depositAmount', 'paymentStatus', 'updatedAt'],
      order: [['updatedAt', 'DESC']],
      limit: 50,
    });

    const providerMap = new Map(
      [...accountMap.values()].map((p) => [p.id, p])
    );

    return paidAppointments.map((appt) => {
      const providerId = marketplaceToProvider.get(appt.marketplaceId);
      const provider = providerId ? providerMap.get(providerId) : undefined;
      const gross =
        appt.paymentStatus === 'partially_paid'
          ? Number(appt.depositAmount ?? appt.price)
          : Number(appt.price);
      const net = gross * (1 - this.COMMISSION_RATE);

      return {
        id: `derived_${appt.id}`,
        provider: {
          id: provider?.id || providerId || '',
          name: provider?.name || provider?.businessName || null,
          profilePic: provider?.profilePic || null,
        },
        amount: this.roundMoney(net),
        status: 'pending' as const,
        date: appt.updatedAt,
        currency: 'USD',
      };
    });
  }

  /**
   * Resolve Stripe payment method type from a PaymentIntent for storage.
   */
  static async resolvePaymentMethod(
    paymentIntent: Stripe.PaymentIntent
  ): Promise<'apple_pay' | 'stripe_card' | 'paypal' | 'cash' | 'other'> {
    try {
      const expanded = await stripe.paymentIntents.retrieve(paymentIntent.id, {
        expand: ['payment_method'],
      });

      const pm = expanded.payment_method as Stripe.PaymentMethod | null;
      if (!pm) {
        return 'stripe_card';
      }

      if (pm.type === 'card') {
        const wallet = pm.card?.wallet?.type;
        if (wallet === 'apple_pay' || wallet === 'google_pay') {
          return 'apple_pay';
        }
        return 'stripe_card';
      }

      if (pm.type === 'paypal') {
        return 'paypal';
      }

      return 'other';
    } catch {
      return 'stripe_card';
    }
  }
}
