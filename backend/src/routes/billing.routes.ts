/**
 * Billing Routes (owner-side, authenticated)
 * Checkout + billing portal. The webhook route lives separately in app.ts
 * because it needs the raw request body, mounted before express.json().
 */

import { Router } from 'express';
import { billingController } from '../controllers/billing.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// POST /api/billing/checkout - Start a Stripe Checkout session to upgrade plan
router.post('/checkout', authenticate, (req, res) => billingController.createCheckoutSession(req, res));

// POST /api/billing/portal - Open the Stripe billing portal for the current subscription
router.post('/portal', authenticate, (req, res) => billingController.createPortalSession(req, res));

export default router;
