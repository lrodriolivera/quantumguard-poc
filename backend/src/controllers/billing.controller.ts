/**
 * Billing Controller
 * Stripe checkout for upgrading Free -> Basic/Pro, the billing portal for
 * self-service plan management, and the webhook that keeps `users.plan` in
 * sync with the subscription's real status.
 */

import { Request, Response } from 'express';
import type Stripe from 'stripe';
import { User } from '../models/user.model';
import {
  BillingNotConfiguredError,
  planForPriceId,
  stripeService,
} from '../services/stripe.service';
import { isPlan, type Plan } from '../utils/plan.utils';

function handleError(res: Response, error: unknown, fallback: string): void {
  if (error instanceof BillingNotConfiguredError) {
    console.error('Billing service not configured:', error.message);
    res.status(503).json({ error: 'Service Unavailable', message: 'Billing is not configured yet' });
    return;
  }
  console.error(fallback, error);
  res.status(500).json({ error: 'Internal Server Error', message: fallback });
}

/** Subscription -> the plan/status fields we persist on the user row. */
function planFieldsFromSubscription(subscription: Stripe.Subscription): {
  plan: Plan | null;
  stripe_subscription_status: string;
  plan_renews_at: Date | null;
} {
  const priceId = subscription.items.data[0]?.price?.id;
  const plan = priceId ? planForPriceId(priceId) ?? null : null;
  const periodEndSeconds = subscription.items.data[0]?.current_period_end;
  return {
    plan,
    stripe_subscription_status: subscription.status,
    plan_renews_at: periodEndSeconds ? new Date(periodEndSeconds * 1000) : null,
  };
}

class BillingController {
  async createCheckoutSession(req: Request, res: Response): Promise<void> {
    try {
      const owner = req.user!;
      const { plan } = req.body as { plan?: string };

      if (!isPlan(plan) || plan === 'free') {
        res.status(400).json({ error: 'Bad Request', message: 'plan debe ser "basic" o "pro"' });
        return;
      }

      const session = await stripeService.createCheckoutSession({
        plan,
        userId: owner.id,
        userEmail: owner.email,
        existingCustomerId: owner.stripe_customer_id || undefined,
      });

      if (!session.url) {
        res.status(502).json({ error: 'Bad Gateway', message: 'Stripe no devolvió una URL de checkout' });
        return;
      }

      res.status(201).json({ url: session.url });
    } catch (error) {
      handleError(res, error, 'Failed to create checkout session');
    }
  }

  async createPortalSession(req: Request, res: Response): Promise<void> {
    try {
      const owner = req.user!;
      if (!owner.stripe_customer_id) {
        res.status(409).json({
          error: 'Conflict',
          message: 'Esta cuenta aún no tiene una suscripción de pago',
        });
        return;
      }

      const session = await stripeService.createBillingPortalSession(owner.stripe_customer_id);
      res.status(201).json({ url: session.url });
    } catch (error) {
      handleError(res, error, 'Failed to create billing portal session');
    }
  }

  /** Raw-body webhook: Stripe signs the exact bytes it sent, so this route
   * must run before express.json() parses the body (see app.ts). */
  async handleWebhook(req: Request, res: Response): Promise<void> {
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') {
      res.status(400).json({ error: 'Bad Request', message: 'Missing Stripe-Signature header' });
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripeService.constructWebhookEvent(req.body as Buffer, signature);
    } catch (error) {
      if (error instanceof BillingNotConfiguredError) {
        res.status(503).json({ error: 'Service Unavailable', message: 'Billing is not configured yet' });
        return;
      }
      console.warn('Stripe webhook signature verification failed:', error);
      res.status(400).json({ error: 'Bad Request', message: 'Invalid signature' });
      return;
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.client_reference_id || session.metadata?.userId;
          const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
          const subscriptionId =
            typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

          if (userId && customerId && subscriptionId) {
            const subscription = await stripeService.retrieveSubscription(subscriptionId);
            const fields = planFieldsFromSubscription(subscription);
            await User.update(
              {
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId,
                stripe_subscription_status: fields.stripe_subscription_status,
                plan_renews_at: fields.plan_renews_at,
                ...(fields.plan ? { plan: fields.plan } : {}),
              },
              { where: { id: userId } }
            );
          }
          break;
        }

        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          const fields = planFieldsFromSubscription(subscription);
          await User.update(
            {
              stripe_subscription_status: fields.stripe_subscription_status,
              plan_renews_at: fields.plan_renews_at,
              ...(fields.plan ? { plan: fields.plan } : {}),
            },
            { where: { stripe_subscription_id: subscription.id } }
          );
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          await User.update(
            { plan: 'free', stripe_subscription_status: 'canceled', plan_renews_at: null },
            { where: { stripe_subscription_id: subscription.id } }
          );
          break;
        }

        default:
          break;
      }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Failed to process Stripe webhook event', event.type, error);
      res.status(500).json({ error: 'Internal Server Error', message: 'Webhook processing failed' });
    }
  }
}

export const billingController = new BillingController();
