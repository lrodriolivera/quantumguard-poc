/**
 * Documents Controller
 * Handles document upload, signing, verification, and management
 */

import { Request, Response } from 'express';
import { Document } from '../models/document.model';
import { Signature } from '../models/signature.model';
import { User } from '../models/user.model';
import { cryptoService, CryptoInputError } from '../services/crypto.service';
import { storageService } from '../services/storage.service';
import {
  buildBundleFiles,
  buildCertificateJson,
  buildVerifyMarkdown,
  isCmsSignedData,
} from '../services/bundle.service';
import {
  DEFAULT_ALGORITHM,
  SUPPORTED_ALGORITHMS,
  buildVerificationResult,
  canonicalAlgorithm,
  signerIdentity,
  x509InvalidReason,
} from '../utils/signature.utils';
import archiver from 'archiver';

// Newest signature first: bundles and clients use signatures[0] as "the" signature.
const LATEST_SIGNATURE_FIRST: any = [[{ model: Signature, as: 'signatures' }, 'timestamp', 'DESC']];

export class DocumentsController {
  /**
   * Upload a document
   * POST /api/documents/upload
   */
  async uploadDocument(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not authenticated',
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'No file uploaded',
        });
        return;
      }

      const file = req.file;

      // Save file to storage
      const stored = await storageService.saveFile(
        req.userId,
        file.buffer,
        file.originalname
      );

      // Create document record
      const document = await Document.create({
        user_id: req.userId,
        filename: file.originalname,
        file_size: file.size,
        mime_type: file.mimetype,
        file_hash: stored.hash,
        original_path: stored.filePath,
        status: 'uploaded',
      });

      console.log(`✅ Document uploaded: ${file.originalname} by user ${req.userId}`);

      res.status(201).json({
        message: 'Document uploaded successfully',
        document: document.toSafeJSON(),
      });
    } catch (error: any) {
      console.error('Upload document error:', error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to upload document',
      });
    }
  }

  /**
   * Sign a stored document with quantum-safe cryptography
   * POST /api/documents/:id/sign
   *
   * Always signs the bytes saved at upload time; any file sent with this
   * request is ignored so the signature cannot cover different content.
   */
  async signDocument(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not authenticated',
        });
        return;
      }

      const { id } = req.params;
      const algorithm = canonicalAlgorithm(req.body?.algorithm || DEFAULT_ALGORITHM);
      if (!algorithm) {
        res.status(400).json({
          error: 'Bad Request',
          message: `Unsupported algorithm. Supported: ${SUPPORTED_ALGORITHMS.join(', ')}`,
        });
        return;
      }

      const document = await Document.findOne({
        where: { id, user_id: req.userId },
      });

      if (!document) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Document not found',
        });
        return;
      }

      if (!document.original_path) {
        res.status(409).json({
          error: 'Conflict',
          message: 'Document file not available for signing',
        });
        return;
      }

      const fileBuffer = await storageService.loadFilePath(document.original_path);
      if (storageService.calculateHash(fileBuffer) !== document.file_hash) {
        console.error(`Stored file integrity mismatch for document ${document.id}`);
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Stored document failed its integrity check; it was not signed',
        });
        return;
      }

      const user = await User.findByPk(req.userId);
      const signatureResponse = await cryptoService.signDocumentX509(
        fileBuffer,
        document.filename,
        algorithm,
        signerIdentity(user),
      );

      if (signatureResponse.document_hash !== document.file_hash) {
        throw new Error('Crypto service signed content that differs from the stored document');
      }

      const signature = await Signature.create({
        document_id: document.id,
        algorithm: signatureResponse.algorithm,
        public_key: signatureResponse.public_key,
        signature_data: signatureResponse.signature,
        document_hash: signatureResponse.document_hash,
        timestamp: new Date(signatureResponse.timestamp),
        valid_until: signatureResponse.valid_until ? new Date(signatureResponse.valid_until) : null,
        quantum_safe: signatureResponse.quantum_safe,
        signature_size: signatureResponse.signature_size,
        signer_cert: signatureResponse.pki.signer_cert_pem,
        cms_signature: signatureResponse.pki.cms_signature_b64,
      });

      await document.update({ status: 'signed' });

      console.log(`✅ Document signed: ${document.id} with ${algorithm}`);

      res.status(200).json({
        message: 'Document signed successfully',
        document: document.toSafeJSON(),
        signature: signature.toSafeJSON(),
        certificate: signatureResponse.pki.certificate,
      });
    } catch (error: any) {
      if (error instanceof CryptoInputError) {
        res.status(400).json({ error: 'Bad Request', message: error.message });
        return;
      }
      console.error('Sign document error:', error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to sign document',
      });
    }
  }

  /**
   * Verify a document signature (public)
   * POST /api/documents/verify
   *
   * A signature is only reported valid when its key is trusted: either the
   * supplied certificate chains to the QuantumGuard CA, or the exact
   * signature/public-key pair exists in our signature registry. A key sent by
   * the caller is never trusted on its own.
   */
  async verifySignature(req: Request, res: Response): Promise<void> {
    try {
      const { signature, publicKey, certificate } = req.body ?? {};

      if (!req.file) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'No file provided',
        });
        return;
      }

      if (!signature || (!publicKey && !certificate)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Signature and a certificate or public key are required',
        });
        return;
      }

      const file = req.file;
      const record = await Signature.findOne({ where: { signature_data: signature } });
      const registered = Boolean(record && publicKey && record.public_key === publicKey);

      if (certificate) {
        const x509 = await cryptoService.verifySignatureX509(
          file.buffer, file.originalname, signature, certificate, record?.timestamp,
        );
        if (x509.valid || !registered) {
          res.status(200).json(buildVerificationResult(x509, {
            method: 'certificate_chain',
            signedAt: record?.timestamp,
            reason: x509.valid ? undefined : x509InvalidReason(x509),
          }));
          return;
        }
      }

      if (registered && record) {
        const raw = await cryptoService.verifySignature(
          file.buffer, file.originalname, signature, record.public_key, record.algorithm,
        );
        res.status(200).json(buildVerificationResult(raw, {
          method: 'registry',
          signedAt: record.timestamp,
          reason: raw.valid ? undefined : 'El documento no coincide con la firma registrada',
        }));
        return;
      }

      res.status(200).json({
        message: 'Signature verification completed',
        valid: false,
        trusted: false,
        verification_method: 'none',
        reason: 'La firma no fue emitida por QuantumGuard: incluye el certificado del firmante o usa el bundle original',
        document_hash: storageService.calculateHash(file.buffer),
        algorithm: canonicalAlgorithm(req.body?.algorithm) || 'desconocido',
        verification_timestamp: new Date().toISOString(),
        quantum_safe: false,
        details: {},
      });
    } catch (error: any) {
      if (error instanceof CryptoInputError) {
        res.status(400).json({ error: 'Bad Request', message: error.message });
        return;
      }
      console.error('Verify signature error:', error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to verify signature',
      });
    }
  }

  /**
   * Get document by ID
   * GET /api/documents/:id
   */
  async getDocument(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not authenticated',
        });
        return;
      }

      const { id } = req.params;

      const document = await Document.findOne({
        where: { id, user_id: req.userId },
        include: [
          {
            model: Signature,
            as: 'signatures',
          },
        ],
        order: LATEST_SIGNATURE_FIRST,
      });

      if (!document) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Document not found',
        });
        return;
      }

      res.status(200).json({
        document: document.toSafeJSON(),
        signatures: document.signatures?.map(s => s.toSafeJSON()) || [],
      });
    } catch (error: any) {
      console.error('Get document error:', error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get document',
      });
    }
  }

  /**
   * List user's documents
   * GET /api/documents
   */
  async listDocuments(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not authenticated',
        });
        return;
      }

      const { page = 1, limit = 10, status } = req.query;

      const where: any = { user_id: req.userId };
      if (status) {
        where.status = status;
      }

      const offset = (Number(page) - 1) * Number(limit);

      const { count, rows } = await Document.findAndCountAll({
        where,
        limit: Number(limit),
        offset,
        order: [['created_at', 'DESC']],
        include: [
          {
            model: Signature,
            as: 'signatures',
          },
        ],
      });

      res.status(200).json({
        documents: rows.map(doc => ({
          ...doc.toSafeJSON(),
          signatures_count: doc.signatures?.length || 0,
        })),
        pagination: {
          total: count,
          page: Number(page),
          limit: Number(limit),
          total_pages: Math.ceil(count / Number(limit)),
          totalPages: Math.ceil(count / Number(limit)),
        },
      });
    } catch (error: any) {
      console.error('List documents error:', error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to list documents',
      });
    }
  }

  /**
   * Delete a document
   * DELETE /api/documents/:id
   */
  async deleteDocument(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not authenticated',
        });
        return;
      }

      const { id } = req.params;

      const document = await Document.findOne({
        where: { id, user_id: req.userId },
      });

      if (!document) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Document not found',
        });
        return;
      }

      await document.destroy();

      console.log(`✅ Document deleted: ${document.filename}`);

      res.status(200).json({
        message: 'Document deleted successfully',
      });
    } catch (error: any) {
      console.error('Delete document error:', error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to delete document',
      });
    }
  }

  /**
   * Download a document file
   * GET /api/documents/:id/download
   * If the document is signed, returns a ZIP with the original file + signature certificate
   */
  async downloadDocument(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not authenticated',
        });
        return;
      }

      const { id } = req.params;

      const document = await Document.findOne({
        where: { id, user_id: req.userId },
        include: [
          {
            model: Signature,
            as: 'signatures',
          },
        ],
        order: LATEST_SIGNATURE_FIRST,
      });

      if (!document) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Document not found',
        });
        return;
      }

      if (!document.original_path) {
        res.status(404).json({
          error: 'Not Found',
          message: 'Document file not available',
        });
        return;
      }

      const fileBuffer = await storageService.loadFilePath(document.original_path);

      // If document is signed, return ZIP bundle with certificate
      if (document.status === 'signed' && document.signatures && document.signatures.length > 0) {
        const sig = document.signatures[0];
        const cmsBuffer = sig.cms_signature ? Buffer.from(sig.cms_signature, 'base64') : null;
        const isPdf = document.mime_type === 'application/pdf';

        let caCertificate: string | null = null;
        if (sig.signer_cert) {
          try {
            caCertificate = await cryptoService.getCaCertificate();
          } catch (caError) {
            console.warn('CA certificate unavailable for bundle:', caError);
          }
        }

        let sealedPdf: Buffer | null = null;
        if (isPdf) {
          try {
            sealedPdf = await cryptoService.addPdfSeal(fileBuffer, document.filename, {
              algorithm: sig.algorithm,
              algorithm_display: sig.algorithmDisplay,
              document_hash: sig.document_hash,
              signed_at: sig.timestamp?.toISOString?.() || String(sig.timestamp),
              valid_until: sig.valid_until?.toISOString?.() || '',
              signature_id: sig.id,
              oid: '',
              nist_standard: sig.algorithm.startsWith('SLH-DSA') ? 'FIPS 205 (SLH-DSA)' : 'FIPS 204 (ML-DSA)',
            });
          } catch (sealError) {
            console.warn('PDF seal failed, bundle will not include a sealed copy:', sealError);
          }
        }

        const files = buildBundleFiles(document, {
          hasCertificate: Boolean(sig.signer_cert),
          hasCa: Boolean(caCertificate),
          hasCmsField: Boolean(cmsBuffer),
          cmsIsReal: Boolean(cmsBuffer && isCmsSignedData(cmsBuffer)),
          sealed: Boolean(sealedPdf),
        });
        const zipFilename = `${files.original.replace(/^original_/, '').replace(/\.[^.]+$/, '')}_quantum_signed.zip`;

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipFilename)}"`);

        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.on('error', (err) => {
          console.error('Bundle archive error:', err);
          res.destroy(err);
        });
        archive.pipe(res);

        archive.append(fileBuffer, { name: files.original });
        if (sealedPdf && files.sealedCopy) {
          archive.append(sealedPdf, { name: files.sealedCopy });
        }
        archive.append(JSON.stringify(buildCertificateJson(document, sig, files), null, 2), {
          name: files.certificateJson,
        });
        if (sig.signer_cert && files.signerCertificate) {
          archive.append(sig.signer_cert, { name: files.signerCertificate });
        }
        if (caCertificate && files.caCertificate) {
          archive.append(caCertificate, { name: files.caCertificate });
        }
        if (cmsBuffer) {
          archive.append(cmsBuffer, { name: (files.cms || files.legacyRawSignature)! });
        }
        archive.append(buildVerifyMarkdown(sig, files), { name: 'VERIFY.md' });

        await archive.finalize();
        return;
      }

      // Unsigned document: return raw file
      res.setHeader('Content-Type', document.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.filename)}"`);
      res.setHeader('Content-Length', fileBuffer.length.toString());
      res.send(fileBuffer);
    } catch (error: any) {
      console.error('Download document error:', error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to download document',
      });
    }
  }

  /**
   * Get document statistics
   * GET /api/documents/stats
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'User not authenticated',
        });
        return;
      }

      const totalDocuments = await Document.count({
        where: { user_id: req.userId },
      });

      const signedDocuments = await Document.count({
        where: { user_id: req.userId, status: 'signed' },
      });

      const pendingDocuments = await Document.count({
        where: { user_id: req.userId, status: 'uploaded' },
      });

      const verifiedDocuments = await Document.count({
        where: { user_id: req.userId, status: 'verified' },
      });

      const totalSignatures = await Signature.count({
        include: [
          {
            model: Document,
            as: 'document',
            where: { user_id: req.userId },
          },
        ],
      });

      res.status(200).json({
        stats: {
          total: totalDocuments,
          total_documents: totalDocuments,
          signed_documents: signedDocuments,
          unsigned_documents: totalDocuments - signedDocuments,
          total_signatures: totalSignatures,
          byStatus: {
            signed: signedDocuments,
            pending: pendingDocuments,
            verified: verifiedDocuments,
          },
        },
      });
    } catch (error: any) {
      console.error('Get stats error:', error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to get statistics',
      });
    }
  }
}

// Export singleton instance
export const documentsController = new DocumentsController();
