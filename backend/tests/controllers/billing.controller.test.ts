/**
 * Billing controller: checkout/portal session creation and the three
 * webhook events that keep `users.plan` synced with Stripe's subscription
 * status. Stripe itself is mocked; this tests our wiring and error mapping.
 */

jest.mock('../../src/models/user.model', () => ({ User: { update: jest.fn() } }));
jest.mock('../../src/services/stripe.service', () => {
  class BillingNotConfiguredError extends Error {}
  return {
    BillingNotConfiguredError,
    planForPriceId: jest.fn(),
    stripeService: {
      createCheckoutSession: jest.fn(),
      createBillingPortalSession: jest.fn(),
      constructWebhookEvent: jest.fn(),
      retrieveSubscription: jest.fn(),
    },
  };
});

import { billingController } from '../../src/controllers/billing.controller';
import { User } from '../../src/models/user.model';
import {
  BillingNotConfiguredError,
  planForPriceId,
  stripeService,
} from '../../src/services/stripe.service';

const mocked = <T>(fn: T) => fn as unknown as jest.Mock;
const body = (res: any) => res.json.mock.calls[0][0];

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const OWNER = { id: 'owner-1', email: 'owner@example.com', plan: 'free', stripe_customer_id: undefined };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createCheckoutSession', () => {
  it('rejects an invalid plan', async () => {
    const req: any = { user: { ...OWNER }, body: { plan: 'free' } };
    const res = mockRes();

    await billingController.createCheckoutSession(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocked(stripeService.createCheckoutSession)).not.toHaveBeenCalled();
  });

  it('creates a session and returns its URL', async () => {
    mocked(stripeService.createCheckoutSession).mockResolvedValue({ url: 'https://checkout.stripe.com/s1' });
    const req: any = { user: { ...OWNER }, body: { plan: 'basic' } };
    const res = mockRes();

    await billingController.createCheckoutSession(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(body(res)).toEqual({ url: 'https://checkout.stripe.com/s1' });
    expect(mocked(stripeService.createCheckoutSession)).toHaveBeenCalledWith({
      plan: 'basic',
      userId: 'owner-1',
      userEmail: 'owner@example.com',
      existingCustomerId: undefined,
    });
  });

  it('returns 503 when billing is not configured', async () => {
    mocked(stripeService.createCheckoutSession).mockRejectedValue(new BillingNotConfiguredError());
    const req: any = { user: { ...OWNER }, body: { plan: 'pro' } };
    const res = mockRes();

    await billingController.createCheckoutSession(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
  });
});

describe('createPortalSession', () => {
  it('refuses when the user has no Stripe customer yet', async () => {
    const req: any = { user: { ...OWNER, stripe_customer_id: undefined } };
    const res = mockRes();

    await billingController.createPortalSession(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('creates a portal session for an existing customer', async () => {
    mocked(stripeService.createBillingPortalSession).mockResolvedValue({ url: 'https://billing.stripe.com/p1' });
    const req: any = { user: { ...OWNER, stripe_customer_id: 'cus_1' } };
    const res = mockRes();

    await billingController.createPortalSession(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(body(res)).toEqual({ url: 'https://billing.stripe.com/p1' });
    expect(mocked(stripeService.createBillingPortalSession)).toHaveBeenCalledWith('cus_1');
  });
});

describe('handleWebhook', () => {
  function webhookReq(rawBody: Buffer, signature?: string) {
    return { headers: signature ? { 'stripe-signature': signature } : {}, body: rawBody } as any;
  }

  it('rejects a request with no Stripe-Signature header', async () => {
    const res = mockRes();
    await billingController.handleWebhook(webhookReq(Buffer.from('{}')), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocked(stripeService.constructWebhookEvent)).not.toHaveBeenCalled();
  });

  it('returns 503 when billing is not configured', async () => {
    mocked(stripeService.constructWebhookEvent).mockImplementation(() => {
      throw new BillingNotConfiguredError();
    });
    const res = mockRes();
    await billingController.handleWebhook(webhookReq(Buffer.from('{}'), 'sig'), res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('rejects a bad signature', async () => {
    mocked(stripeService.constructWebhookEvent).mockImplementation(() => {
      throw new Error('bad signature');
    });
    const res = mockRes();
    await billingController.handleWebhook(webhookReq(Buffer.from('{}'), 'sig'), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('on checkout.session.completed, saves the customer/subscription and upgrades the plan', async () => {
    mocked(stripeService.constructWebhookEvent).mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'owner-1',
          customer: 'cus_1',
          subscription: 'sub_1',
        },
      },
    });
    mocked(stripeService.retrieveSubscription).mockResolvedValue({
      status: 'active',
      items: { data: [{ price: { id: 'price_basic' }, current_period_end: 1700000000 }] },
    });
    mocked(planForPriceId).mockReturnValue('basic');

    const res = mockRes();
    await billingController.handleWebhook(webhookReq(Buffer.from('{}'), 'sig'), res);

    expect(mocked(User.update)).toHaveBeenCalledWith(
      {
        stripe_customer_id: 'cus_1',
        stripe_subscription_id: 'sub_1',
        stripe_subscription_status: 'active',
        plan_renews_at: new Date(1700000000 * 1000),
        plan: 'basic',
      },
      { where: { id: 'owner-1' } }
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('on customer.subscription.updated, refreshes status/plan by subscription id', async () => {
    mocked(stripeService.constructWebhookEvent).mockReturnValue({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1',
          status: 'past_due',
          items: { data: [{ price: { id: 'price_pro' }, current_period_end: 1700000500 }] },
        },
      },
    });
    mocked(planForPriceId).mockReturnValue('pro');

    const res = mockRes();
    await billingController.handleWebhook(webhookReq(Buffer.from('{}'), 'sig'), res);

    expect(mocked(User.update)).toHaveBeenCalledWith(
      {
        stripe_subscription_status: 'past_due',
        plan_renews_at: new Date(1700000500 * 1000),
        plan: 'pro',
      },
      { where: { stripe_subscription_id: 'sub_1' } }
    );
  });

  it('on customer.subscription.deleted, reverts the account to the free plan', async () => {
    mocked(stripeService.constructWebhookEvent).mockReturnValue({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1' } },
    });

    const res = mockRes();
    await billingController.handleWebhook(webhookReq(Buffer.from('{}'), 'sig'), res);

    expect(mocked(User.update)).toHaveBeenCalledWith(
      { plan: 'free', stripe_subscription_status: 'canceled', plan_renews_at: null },
      { where: { stripe_subscription_id: 'sub_1' } }
    );
  });

  it('ignores event types it does not act on', async () => {
    mocked(stripeService.constructWebhookEvent).mockReturnValue({
      type: 'invoice.paid',
      data: { object: {} },
    });

    const res = mockRes();
    await billingController.handleWebhook(webhookReq(Buffer.from('{}'), 'sig'), res);

    expect(mocked(User.update)).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
