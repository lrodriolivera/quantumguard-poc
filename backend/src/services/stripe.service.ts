/**
 * Stripe Service
 * Subscription billing for the paid "firma simple" tiers (Basic/Pro). Like
 * the Resend integration, this fails loudly (503) instead of silently when
 * Stripe isn't configured, rather than pretending a checkout happened.
 */

import Stripe from 'stripe';
import type { Plan } from '../utils/plan.utils';

const SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
export const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || 'https://app.postcuantica.io').replace(/\/$/, '');

const PRICE_TO_PLAN: Partial<Record<string, Plan>> = {
  [process.env.STRIPE_PRICE_BASIC || '']: 'basic',
  [process.env.STRIPE_PRICE_PRO || '']: 'pro',
};

const PLAN_TO_PRICE: Partial<Record<Plan, string>> = {
  basic: process.env.STRIPE_PRICE_BASIC,
  pro: process.env.STRIPE_PRICE_PRO,
};

export class BillingNotConfiguredError extends Error {
  constructor() {
    super('STRIPE_SECRET_KEY is not set; billing is disabled');
  }
}

let client: Stripe | null = null;
function getClient(): Stripe {
  if (!SECRET_KEY) throw new BillingNotConfiguredError();
  client ??= new Stripe(SECRET_KEY);
  return client;
}

export function priceIdForPlan(plan: Plan): string {
  const priceId = PLAN_TO_PRICE[plan];
  if (!priceId) throw new Error(`No Stripe price configured for plan "${plan}"`);
  return priceId;
}

export function planForPriceId(priceId: string): Plan | undefined {
  return PRICE_TO_PLAN[priceId];
}

export const stripeService = {
  isConfigured(): boolean {
    return Boolean(SECRET_KEY);
  },

  async createCheckoutSession(params: {
    plan: Plan;
    userId: string;
    userEmail: string;
    existingCustomerId?: string;
  }): Promise<Stripe.Checkout.Session> {
    const stripe = getClient();
    const priceId = priceIdForPlan(params.plan);
    return stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: params.userId,
      metadata: { userId: params.userId, plan: params.plan },
      subscription_data: { metadata: { userId: params.userId, plan: params.plan } },
      ...(params.existingCustomerId
        ? { customer: params.existingCustomerId }
        : { customer_email: params.userEmail }),
      success_url: `${FRONTEND_BASE_URL}/profile?billing=success`,
      cancel_url: `${FRONTEND_BASE_URL}/profile?billing=cancelled`,
    });
  },

  async createBillingPortalSession(customerId: string): Promise<Stripe.BillingPortal.Session> {
    const stripe = getClient();
    return stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${FRONTEND_BASE_URL}/profile`,
    });
  },

  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const stripe = getClient();
    if (!WEBHOOK_SECRET) throw new BillingNotConfiguredError();
    return stripe.webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET);
  },

  async retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    const stripe = getClient();
    return stripe.subscriptions.retrieve(subscriptionId);
  },
};
