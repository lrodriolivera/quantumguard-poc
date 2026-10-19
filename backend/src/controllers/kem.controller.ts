/**
 * KEM Controller
 * Handles ML-KEM (Kyber) key encapsulation operations
 */

import { Request, Response } from 'express';
import { cryptoService } from '../services/crypto.service';

export class KEMController {
  /**
   * Generate a KEM keypair
   * POST /api/kem/keypair/generate
   */
  async generateKeypair(req: Request, res: Response): Promise<void> {
    try {
      const { algorithm = 'ML-KEM-768' } = req.body;

      const result = await cryptoService.generateKEMKeypair(algorithm);

      res.status(200).json({
        message: 'KEM keypair generated successfully',
        ...result,
      });
    } catch (error: any) {
      console.error('KEM keypair generation error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message || 'Failed to generate KEM keypair',
      });
    }
  }

  /**
   * Encapsulate: generate shared secret + ciphertext
   * POST /api/kem/encapsulate
   */
  async encapsulate(req: Request, res: Response): Promise<void> {
    try {
      const { public_key, algorithm = 'ML-KEM-768' } = req.body;

      if (!public_key) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'public_key is required',
        });
        return;
      }

      const result = await cryptoService.encapsulate(public_key, algorithm);

      res.status(200).json({
        message: 'Encapsulation completed successfully',
        ...result,
      });
    } catch (error: any) {
      console.error('KEM encapsulation error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message || 'Failed to encapsulate',
      });
    }
  }

  /**
   * Decapsulate: recover shared secret
   * POST /api/kem/decapsulate
   */
  async decapsulate(req: Request, res: Response): Promise<void> {
    try {
      const { ciphertext, keypair_id, algorithm = 'ML-KEM-768' } = req.body;

      if (!ciphertext || !keypair_id) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'ciphertext and keypair_id are required',
        });
        return;
      }

      const result = await cryptoService.decapsulate(ciphertext, keypair_id, algorithm);

      res.status(200).json({
        message: 'Decapsulation completed successfully',
        ...result,
      });
    } catch (error: any) {
      console.error('KEM decapsulation error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message || 'Failed to decapsulate',
      });
    }
  }

  /**
   * List supported KEM algorithms
   * GET /api/kem/algorithms
   */
  async listAlgorithms(req: Request, res: Response): Promise<void> {
    try {
      const result = await cryptoService.listKEMAlgorithms();
      res.status(200).json(result);
    } catch (error: any) {
      console.error('List KEM algorithms error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message || 'Failed to list KEM algorithms',
      });
    }
  }
}

export const kemController = new KEMController();
