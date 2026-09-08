import { Request, Response } from 'express';
import { User } from '../models/user_model';
import { StripeService } from '../services/stripe.service';

interface AuthRequest extends Request {
  userId?: string;
}

function buildOnboardingUrls() {
  // These must point at a URL Stripe can actually redirect the provider's
  // browser to and get a response from. FRONTEND_URL is a separate
  // marketing site that doesn't implement these routes, so we use BASE_URL
  // (this API's own public address, already reachable by definition) and
  // serve simple confirmation pages for them below.
  const base = process.env.BASE_URL || 'http://localhost:4000';

  return {
    refreshUrl: `${base}/stripe-connect/refresh`,
    returnUrl: `${base}/stripe-connect/complete`,
  };
}

function renderConnectStatusPage(res: Response, opts: { title: string; message: string }) {
  res.set('Content-Type', 'text/html');
  return res.status(200).send(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${opts.title}</title>
    <style>
      body { font-family: -apple-system, system-ui, sans-serif; background: #fafafa; color: #111; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; text-align: center; }
      .card { max-width: 360px; }
      h1 { font-size: 20px; margin-bottom: 8px; }
      p { font-size: 15px; color: #555; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${opts.title}</h1>
      <p>${opts.message}</p>
      <p>You can close this window and return to the Booqly app.</p>
    </div>
  </body>
</html>`);
}

/**
 * Stripe redirects the provider's browser here once they finish (or need to
 * resume) Connect onboarding. The app itself detects completion by polling
 * /stripe-connect/status when it regains focus, so this page only needs to
 * exist so the redirect doesn't hit a dead connection.
 */
export const connectOnboardingComplete = (_req: Request, res: Response) => {
  return renderConnectStatusPage(res, {
    title: "You're all set",
    message: 'Your Stripe account setup was submitted successfully.',
  });
};

export const connectOnboardingRefresh = (_req: Request, res: Response) => {
  return renderConnectStatusPage(res, {
    title: 'Setup link expired',
    message: 'Please reopen "Payouts" in the Booqly app to get a new setup link.',
  });
};

/**
 * Start (or resume) Stripe Connect Express onboarding for the authenticated provider.
 * Creates the connected account if it doesn't exist yet, then returns a
 * Stripe-hosted onboarding link for the app to open.
 */
export const startConnectOnboarding = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.userId) {
      return res.status(401).json({ status: false, message: 'Authentication required' });
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({ status: false, message: 'User not found' });
    }

    const accountId = await StripeService.createConnectAccount(user);
    const { refreshUrl, returnUrl } = buildOnboardingUrls();
    const url = await StripeService.createConnectOnboardingLink(accountId, refreshUrl, returnUrl);

    return res.status(200).json({
      status: true,
      message: 'Stripe Connect onboarding link created',
      data: { url, accountId },
    });
  } catch (error: any) {
    console.error('Error starting Stripe Connect onboarding:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to start Stripe Connect onboarding',
      error: error.message,
    });
  }
};

/**
 * Return the authenticated provider's current Connect account status, synced live from Stripe.
 */
export const getConnectStatus = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.userId) {
      return res.status(401).json({ status: false, message: 'Authentication required' });
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({ status: false, message: 'User not found' });
    }

    if (!user.stripeConnectAccountId) {
      return res.status(200).json({
        status: true,
        data: {
          connected: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
        },
      });
    }

    await StripeService.syncConnectAccountStatus(user);
    await user.reload();

    return res.status(200).json({
      status: true,
      data: {
        connected: true,
        accountId: user.stripeConnectAccountId,
        chargesEnabled: user.stripeConnectChargesEnabled,
        payoutsEnabled: user.stripeConnectPayoutsEnabled,
        detailsSubmitted: user.stripeConnectDetailsSubmitted,
      },
    });
  } catch (error: any) {
    console.error('Error fetching Stripe Connect status:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to fetch Stripe Connect status',
      error: error.message,
    });
  }
};

/**
 * Login link into the provider's Stripe Express dashboard (only works once onboarded).
 */
export const getConnectDashboardLink = async (req: AuthRequest, res: Response): Promise<Response> => {
  try {
    if (!req.userId) {
      return res.status(401).json({ status: false, message: 'Authentication required' });
    }

    const user = await User.findByPk(req.userId);
    if (!user?.stripeConnectAccountId) {
      return res.status(400).json({
        status: false,
        message: 'No Stripe Connect account found. Complete onboarding first.',
      });
    }

    const url = await StripeService.createConnectDashboardLink(user.stripeConnectAccountId);

    return res.status(200).json({ status: true, data: { url } });
  } catch (error: any) {
    console.error('Error creating Stripe Connect dashboard link:', error);
    return res.status(500).json({
      status: false,
      message: 'Failed to create Stripe Connect dashboard link',
      error: error.message,
    });
  }
};
