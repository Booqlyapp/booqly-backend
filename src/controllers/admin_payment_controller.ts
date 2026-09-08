import { Request, Response } from 'express';
import { AdminPaymentService } from '../services/admin_payment.service';

interface AuthRequest extends Request {
  user?: any;
  userId?: string;
}

export const getPaymentSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;
    const data = await AdminPaymentService.getSummary(
      startDate as string | undefined,
      endDate as string | undefined
    );

    res.status(200).json({
      status: true,
      message: 'Payment summary retrieved successfully',
      data,
    });
  } catch (error) {
    console.error('Error fetching payment summary:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch payment summary',
    });
  }
};

export const getCommissionByCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;
    const data = await AdminPaymentService.getCommissionByCategory(
      startDate as string | undefined,
      endDate as string | undefined
    );

    res.status(200).json({
      status: true,
      message: 'Commission by category retrieved successfully',
      data,
    });
  } catch (error) {
    console.error('Error fetching commission by category:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch commission by category',
    });
  }
};

export const getCommissionByPaymentMethod = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;
    const data = await AdminPaymentService.getCommissionByPaymentMethod(
      startDate as string | undefined,
      endDate as string | undefined
    );

    res.status(200).json({
      status: true,
      message: 'Commission by payment method retrieved successfully',
      data,
    });
  } catch (error) {
    console.error('Error fetching commission by payment method:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch commission by payment method',
    });
  }
};

export const getTopPayingClients = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, limit } = req.query;
    const data = await AdminPaymentService.getTopClients(
      startDate as string | undefined,
      endDate as string | undefined,
      limit ? parseInt(limit as string, 10) : 10
    );

    res.status(200).json({
      status: true,
      message: 'Top paying clients retrieved successfully',
      data,
    });
  } catch (error) {
    console.error('Error fetching top paying clients:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch top paying clients',
    });
  }
};

export const getStripeConnectStatusList = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { page, limit, search } = req.query;
    const data = await AdminPaymentService.getStripeConnectStatus(
      page ? parseInt(page as string, 10) : 1,
      limit ? parseInt(limit as string, 10) : 10,
      search as string | undefined
    );

    res.status(200).json({
      status: true,
      message: 'Stripe Connect status retrieved successfully',
      data,
    });
  } catch (error) {
    console.error('Error fetching Stripe Connect status:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch Stripe Connect status',
    });
  }
};

export const getRecentPayouts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page, limit } = req.query;
    const data = await AdminPaymentService.getRecentPayouts(
      page ? parseInt(page as string, 10) : 1,
      limit ? parseInt(limit as string, 10) : 10
    );

    res.status(200).json({
      status: true,
      message: 'Recent payouts retrieved successfully',
      data,
    });
  } catch (error) {
    console.error('Error fetching recent payouts:', error);
    res.status(500).json({
      status: false,
      message: 'Failed to fetch recent payouts',
    });
  }
};
