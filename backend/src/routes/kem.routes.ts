/**
 * KEM Routes
 * Routes for ML-KEM (Kyber) key encapsulation operations
 */

import { Router } from 'express';
import { kemController } from '../controllers/kem.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// KEM keypair generation
router.post('/keypair/generate', authenticate, (req, res) => kemController.generateKeypair(req, res));

// Encapsulate (create shared secret + ciphertext)
router.post('/encapsulate', authenticate, (req, res) => kemController.encapsulate(req, res));

// Decapsulate (recover shared secret)
router.post('/decapsulate', authenticate, (req, res) => kemController.decapsulate(req, res));

// List supported KEM algorithms (public)
router.get('/algorithms', (req, res) => kemController.listAlgorithms(req, res));

export default router;
