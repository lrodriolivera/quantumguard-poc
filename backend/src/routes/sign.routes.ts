/**
 * Public Signing Routes (no account — identified by a single-use token)
 * The link an invited signer receives by email.
 */

import { Router } from 'express';
import { envelopesController } from '../controllers/envelopes.controller';
import { otpLimiter, publicSignLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// GET /api/sign/:token - Load the document/signer info for this link
router.get('/:token', publicSignLimiter, (req, res) => envelopesController.getPublicSigner(req, res));

// GET /api/sign/:token/document - Review the document before/while signing
router.get('/:token/document', publicSignLimiter, (req, res) => envelopesController.getPublicDocument(req, res));

// POST /api/sign/:token/otp - Request a fresh verification code by email
router.post('/:token/otp', otpLimiter, (req, res) => envelopesController.requestOtp(req, res));

// POST /api/sign/:token/otp/verify - Verify the code
router.post('/:token/otp/verify', otpLimiter, (req, res) => envelopesController.verifyOtp(req, res));

// POST /api/sign/:token/sign - Sign, once the code has been verified
router.post('/:token/sign', publicSignLimiter, (req, res) => envelopesController.signAsEnvelopeSigner(req, res));

// POST /api/sign/:token/decline - Decline to sign
router.post('/:token/decline', publicSignLimiter, (req, res) => envelopesController.declineSigning(req, res));

export default router;
