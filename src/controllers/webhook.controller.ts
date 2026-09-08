import { Request, Response } from 'express';
import Stripe from 'stripe';
import { Appointment } from '../models/appointment_model';
import { StripeService } from '../services/stripe.service';
import { AdminPaymentService } from '../services/admin_payment.service';
import { log } from '../utils/logger';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/**
 * Unified Stripe webhook handler for both subscriptions and payments
 */
export const handleStripeWebhook = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    console.error('⚠️ Webhook Error: No signature header');
    return res.status(400).send('Webhook Error: No signature');
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log(`✅ Webhook verified: ${event.type}`);
  } catch (err: any) {
    console.error(`⚠️ Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Route to appropriate handler based on event type
    if (
      event.type.startsWith('customer.subscription.') ||
      event.type.startsWith('invoice.') ||
      event.type === 'account.updated'
    ) {
      // Use existing StripeService for subscription + Connect account events
      await StripeService.handleWebhook(event);
    } else if (event.type.startsWith('payment_intent.')) {
      await handlePaymentIntentEvent(event);
    } else if (event.type.startsWith('charge.')) {
      await handleChargeEvent(event);
    } else if (event.type.startsWith('refund.')) {
      await handleRefundEvent(event);
    } else {
      console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    log.info('Webhook handled successfully', { eventType: event.type, eventId: event.id });
    res.json({ received: true });
  } catch (error: any) {
    console.error(`❌ Error processing webhook: ${error.message}`);
    log.error('Webhook processing failed', { error: error.message, eventType: event.type });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

/**
 * Handle payment intent events (for booking payments)
 */
async function handlePaymentIntentEvent(event: Stripe.Event) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;

  console.log(`💰 Processing payment intent event: ${event.type}`);
  console.log(`   Payment Intent: ${paymentIntent.id}`);
  console.log(`   Amount: ${paymentIntent.amount / 100} ${paymentIntent.currency.toUpperCase()}`);

  // Get appointment ID from metadata
  const appointmentId = paymentIntent.metadata?.appointmentId;

  if (!appointmentId) {
    console.log(`ℹ️ No appointmentId in metadata, skipping`);
    return;
  }

  const appointment = await Appointment.findByPk(appointmentId);

  if (!appointment) {
    console.error(`❌ Appointment not found: ${appointmentId}`);
    return;
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentMethod = await AdminPaymentService.resolvePaymentMethod(paymentIntent);
      const remaining = Number(appointment.remainingBalance ?? 0);
      const deposit = Number(appointment.depositAmount ?? 0);
      // Deposit-only payments leave a balance due at the appointment.
      const paymentStatus =
        deposit > 0 && remaining > 0 ? 'partially_paid' : 'paid';
      await appointment.update({
        paymentStatus,
        paymentMethod,
      });
      console.log(`✅ Payment succeeded for appointment: ${appointmentId} (${paymentStatus}) - Payment Intent: ${paymentIntent.id}`);
      // TODO: Send confirmation email/notification
      break;
    }

    case 'payment_intent.payment_failed':
      await appointment.update({
        paymentStatus: 'failed',
      });
      console.log(`❌ Payment failed for appointment: ${appointmentId}`);
      // TODO: Send failure notification
      break;

    case 'payment_intent.canceled':
      await appointment.update({
        paymentStatus: 'failed',
        status: 'canceled',
      });
      console.log(`⚠️ Payment canceled for appointment: ${appointmentId}`);
      break;
  }
}

/**
 * Handle charge events (backup/additional tracking)
 */
async function handleChargeEvent(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;

  console.log(`🔔 Processing charge event: ${event.type}`);
  console.log(`   Charge: ${charge.id}`);
  console.log(`   Amount: ${charge.amount / 100} ${charge.currency.toUpperCase()}`);

  // Additional logging or tracking can be added here
  switch (event.type) {
    case 'charge.succeeded':
      console.log(`✅ Charge succeeded: ${charge.id}`);
      break;

    case 'charge.failed':
      console.log(`❌ Charge failed: ${charge.id}`);
      break;

    case 'charge.refunded':
      console.log(`💸 Charge refunded: ${charge.id}`);
      // Handle refund logic if needed
      const appointmentId = charge.metadata?.appointmentId;
      if (appointmentId) {
        const appointment = await Appointment.findByPk(appointmentId);
        if (appointment) {
          await appointment.update({
            paymentStatus: 'refunded',
            status: 'canceled',
          });
          console.log(`✅ Appointment ${appointmentId} marked as refunded`);
        }
      }
      break;
  }
}

/**
 * Handle refund events
 */
async function handleRefundEvent(event: Stripe.Event) {
  const refund = event.data.object as Stripe.Refund;

  console.log(`💸 Processing refund event: ${event.type}`);
  console.log(`   Refund: ${refund.id}`);
  console.log(`   Amount: ${refund.amount / 100} ${refund.currency.toUpperCase()}`);

  // Get charge to find appointment
  if (refund.charge) {
    const charge = await stripe.charges.retrieve(refund.charge as string);
    const appointmentId = charge.metadata?.appointmentId;

    if (appointmentId) {
      const appointment = await Appointment.findByPk(appointmentId);
      if (appointment) {
        switch (event.type) {
          case 'refund.created':
            console.log(`✅ Refund initiated for appointment: ${appointmentId}`);
            // Keep current payment status until refund completes
            break;

          case 'refund.updated':
            if (refund.status === 'succeeded') {
              await appointment.update({
                paymentStatus: 'refunded',
                status: 'canceled',
              });
              console.log(`✅ Refund completed for appointment: ${appointmentId}`);
            } else if (refund.status === 'failed') {
              console.log(`❌ Refund failed for appointment: ${appointmentId} - keeping current status`);
              // Keep current payment status if refund fails
            }
            break;
        }
      }
    }
  }
}
