/**
 * Envelope Routes (owner-side, authenticated)
 * Creating and tracking a "firma simple" signing request.
 */

import { Router } from 'express';
import { envelopesController } from '../controllers/envelopes.controller';
import { authenticate } from '../middleware/auth.middleware';
import { envelopeLimiter } from '../middleware/rateLimit.middleware';
import { validateUUID } from '../middleware/validation.middleware';

const router = Router();

router.param('id', (req, res, next) => validateUUID('id')(req, res, next));

// POST /api/envelopes - Create an envelope and send the invites
router.post('/', authenticate, envelopeLimiter, (req, res) => envelopesController.createEnvelope(req, res));

// GET /api/envelopes - List the caller's envelopes
router.get('/', authenticate, (req, res) => envelopesController.listEnvelopes(req, res));

// GET /api/envelopes/:id - Get one envelope and its signers' status
router.get('/:id', authenticate, (req, res) => envelopesController.getEnvelope(req, res));

// POST /api/envelopes/:id/void - Cancel a pending envelope
router.post('/:id/void', authenticate, (req, res) => envelopesController.voidEnvelope(req, res));

export default router;
