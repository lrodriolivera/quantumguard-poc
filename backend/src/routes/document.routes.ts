/**
 * Document Routes
 * Document management, signing, and verification endpoints
 */

import { Router } from 'express';
import multer from 'multer';
import { documentsController } from '../controllers/documents.controller';
import { authenticate } from '../middleware/auth.middleware';
import { signLimiter, uploadLimiter, verifyLimiter } from '../middleware/rateLimit.middleware';
import { validateUUID } from '../middleware/validation.middleware';

const router = Router();

router.param('id', (req, res, next) => validateUUID('id')(req, res, next));

// Configure multer to store files in memory
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Accept all file types for now
    cb(null, true);
  },
});

/**
 * Protected routes (authentication required)
 */

// POST /api/documents/upload - Upload a document
router.post('/upload', authenticate, uploadLimiter, upload.single('file'), (req, res) =>
  documentsController.uploadDocument(req, res)
);

// POST /api/documents/:id/sign - Sign the stored document (multipart kept for the
// algorithm field and older clients that still attach the file, which is ignored)
router.post('/:id/sign', authenticate, signLimiter, upload.single('file'), (req, res) =>
  documentsController.signDocument(req, res)
);

// GET /api/documents - List user's documents
router.get('/', authenticate, (req, res) => documentsController.listDocuments(req, res));

// GET /api/documents/stats - Get document statistics
router.get('/stats', authenticate, (req, res) => documentsController.getStats(req, res));

// GET /api/documents/:id/download - Download document file
router.get('/:id/download', authenticate, (req, res) => documentsController.downloadDocument(req, res));

// GET /api/documents/:id - Get document by ID
router.get('/:id', authenticate, (req, res) => documentsController.getDocument(req, res));

// DELETE /api/documents/:id - Delete a document
router.delete('/:id', authenticate, (req, res) =>
  documentsController.deleteDocument(req, res)
);

/**
 * Public routes (no authentication required)
 */

// POST /api/documents/verify - Verify a document signature
router.post('/verify', verifyLimiter, upload.single('file'), (req, res) =>
  documentsController.verifySignature(req, res)
);

export default router;
