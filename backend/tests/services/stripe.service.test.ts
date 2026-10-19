/**
 * Stripe service: price <-> plan mapping and the "not configured" guard.
 * The Stripe SDK itself is mocked — this tests our wiring, not Stripe's API.
 */

const mockCreateCheckoutSession = jest.fn();
const mockCreatePortalSession = jest.fn();
const mockConstructEvent = jest.fn();
const mockRetrieveSubscription = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockCreateCheckoutSession } },
    billingPortal: { sessions: { create: mockCreatePortalSession } },
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockRetrieveSubscription },
  }));
});

const ORIGINAL_ENV = { ...process.env };

async function freshImport() {
  jest.resetModules();
  return import('../../src/services/stripe.service');
}

describe('stripeService', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.clearAllMocks();
  });

  it('is not configured without STRIPE_SECRET_KEY', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { stripeService } = await freshImport();
    expect(stripeService.isConfigured()).toBe(false);
  });

  it('throws BillingNotConfiguredError when creating a checkout session without a key', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_PRICE_BASIC = 'price_basic';
    const { stripeService, BillingNotConfiguredError } = await freshImport();

    await expect(
      stripeService.createCheckoutSession({ plan: 'basic', userId: 'u1', userEmail: 'u1@example.com' })
    ).rejects.toBeInstanceOf(BillingNotConfiguredError);
  });

  it('maps plan -> price id and back for checkout + webhook handling', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_PRICE_BASIC = 'price_basic';
    process.env.STRIPE_PRICE_PRO = 'price_pro';
    const { priceIdForPlan, planForPriceId } = await freshImport();

    expect(priceIdForPlan('basic')).toBe('price_basic');
    expect(priceIdForPlan('pro')).toBe('price_pro');
    expect(planForPriceId('price_basic')).toBe('basic');
    expect(planForPriceId('price_pro')).toBe('pro');
    expect(planForPriceId('price_unknown')).toBeUndefined();
  });

  it('throws when a plan has no price configured', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    delete process.env.STRIPE_PRICE_BASIC;
    const { priceIdForPlan } = await freshImport();

    expect(() => priceIdForPlan('basic')).toThrow(/No Stripe price configured/);
  });

  it('creates a checkout session for a new customer using their email', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_PRICE_BASIC = 'price_basic';
    process.env.FRONTEND_BASE_URL = 'https://app.postcuantica.io';
    mockCreateCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/session_1' });

    const { stripeService } = await freshImport();
    const session = await stripeService.createCheckoutSession({
      plan: 'basic',
      userId: 'u1',
      userEmail: 'u1@example.com',
    });

    expect(session.url).toBe('https://checkout.stripe.com/session_1');
    const [args] = mockCreateCheckoutSession.mock.calls[0];
    expect(args.customer_email).toBe('u1@example.com');
    expect(args.customer).toBeUndefined();
    expect(args.client_reference_id).toBe('u1');
    expect(args.line_items[0].price).toBe('price_basic');
    expect(args.success_url).toBe('https://app.postcuantica.io/profile?billing=success');
  });

  it('reuses the existing Stripe customer instead of customer_email when one exists', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_PRICE_PRO = 'price_pro';
    mockCreateCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.com/session_2' });

    const { stripeService } = await freshImport();
    await stripeService.createCheckoutSession({
      plan: 'pro',
      userId: 'u1',
      userEmail: 'u1@example.com',
      existingCustomerId: 'cus_123',
    });

    const [args] = mockCreateCheckoutSession.mock.calls[0];
    expect(args.customer).toBe('cus_123');
    expect(args.customer_email).toBeUndefined();
  });

  it('verifies webhook signatures through the Stripe SDK with the configured secret', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_123';
    mockConstructEvent.mockReturnValue({ type: 'checkout.session.completed' });

    const { stripeService } = await freshImport();
    const event = stripeService.constructWebhookEvent(Buffer.from('{}'), 'sig_abc');

    expect(event.type).toBe('checkout.session.completed');
    expect(mockConstructEvent).toHaveBeenCalledWith(Buffer.from('{}'), 'sig_abc', 'whsec_123');
  });

  it('refuses to verify a webhook when no webhook secret is configured', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const { stripeService, BillingNotConfiguredError } = await freshImport();

    expect(() => stripeService.constructWebhookEvent(Buffer.from('{}'), 'sig_abc')).toThrow(
      BillingNotConfiguredError
    );
  });
});
