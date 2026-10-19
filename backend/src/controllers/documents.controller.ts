/**
 * Documents Controller
 * Handles document upload, signing, verification, and management
 */

import { Request, Response } from 'express';
import { Document } from '../models/document.model';
import { Signature } from '../models/signature.model';
import { User } from '../models/user.model';
import { cryptoService, CryptoInputError, TrustMaterial } from '../services/crypto.service';
import { storageService } from '../services/storage.service';
import {
  buildBundleFiles,
  buildCertificateJson,
  buildVerifyMarkdown,
  isCmsSignedData,
  signedPdfName,
} from '../services/bundle.service';
import {
  DEFAULT_ALGORITHM,
  REVOCATION_REASONS,
  SUPPORTED_ALGORITHMS,
  SUPPORTED_COUNTRIES,
  buildPdfVerificationResult,
  buildVerificationResult,
  canonicalAlgorithm,
  parseBoolean,
  parseCountry,
  signerIdentity,
} from '../utils/signature.utils';
import { Sequelize } from 'sequelize-typescript';
import { createHash } from 'crypto';
import archiver from 'archiver';

/** Indexed lookup (md5 functional index) of a signature by its exact value. */
function findSignatureRecord(signatureData: string): Promise<Signature | null> {
  const digest = createHash('md5').update(signatureData).digest('hex');
  return Signature.findOne({
    where: Sequelize.and(
      Sequelize.where(Sequelize.fn('md5', Sequelize.col('signature_data')), digest),
      { signature_data: signatureData },
    ),
  });
}

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
      const country = parseCountry(req.body?.country);
      const hybrid = parseBoolean(req.body?.hybrid, true);
      if (!algorithm || !country || hybrid === null) {
        res.status(400).json({
          error: 'Bad Request',
          message: !algorithm
            ? `Unsupported algorithm. Supported: ${SUPPORTED_ALGORITHMS.join(', ')}`
            : !country
              ? `Unsupported country. Supported: ${SUPPORTED_COUNTRIES.join(', ')}`
              : 'hybrid must be true or false',
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
      const signed = await cryptoService.signDocumentX509(
        fileBuffer,
        document.filename,
        algorithm,
        signerIdentity(user),
        { country, hybrid },
      );

      if (signed.document_hash !== document.file_hash) {
        throw new Error('Crypto service signed content that differs from the stored document');
      }

      let signedPdf: { filePath: string; hash: string } | null = null;
      if (signed.signed_pdf) {
        signedPdf = await storageService.saveFile(
          req.userId,
          Buffer.from(signed.signed_pdf, 'base64'),
          signedPdfName(document.filename),
        );
      }

      const signature = await Signature.create({
        document_id: document.id,
        algorithm: signed.algorithm,
        public_key: signed.public_key,
        signature_data: signed.signature,
        document_hash: signed.document_hash,
        timestamp: new Date(signed.timestamp),
        valid_until: signed.valid_until ? new Date(signed.valid_until) : null,
        quantum_safe: signed.quantum_safe,
        signature_size: signed.signature_size,
        signer_cert: signed.pki.signer_cert_pem,
        cms_signature: signed.pki.cms_signature_b64,
        issuer_cert: signed.pki.issuer_cert_pem,
        country: signed.country,
        cert_serial: signed.pki.certificate.serial,
        hybrid: signed.hybrid,
        classical_algorithm: signed.classical?.algorithm ?? null,
        classical_signature: signed.classical?.signature ?? null,
        classical_cert: signed.classical?.cert_pem ?? null,
        timestamp_token: signed.time_stamp.token,
        timestamp_time: new Date(signed.time_stamp.gen_time),
        signed_pdf_path: signedPdf?.filePath ?? null,
        signed_pdf_hash: signedPdf?.hash ?? null,
      });

      await document.update({ status: 'signed' });

      console.log(`✅ Document signed: ${document.id} with ${algorithm} (${country}, hybrid=${hybrid})`);

      res.status(200).json({
        message: 'Document signed successfully',
        document: document.toSafeJSON(),
        signature: signature.toSafeJSON(),
        certificate: signed.pki.certificate,
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
   * A signature is only reported valid when its key is trusted. In order:
   *  1. registry: the exact signature/public-key pair was issued by us; the
   *     stored CMS, time-stamp and revocation state are checked against the file;
   *  2. CMS bundle (signature.p7s [+ timestamp]) whose signers chain to our root;
   *  3. raw signature + signer certificate chaining to our root.
   * A key sent by the caller is never trusted on its own.
   */
  async verifySignature(req: Request, res: Response): Promise<void> {
    try {
      const { signature, publicKey, certificate, cms, timestampToken } = req.body ?? {};

      if (!req.file) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'No file provided',
        });
        return;
      }

      if (!(signature && (publicKey || certificate)) && !cms) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Provide signature with a certificate or public key, or a CMS signature',
        });
        return;
      }

      const file = req.file;
      const record = signature ? await findSignatureRecord(signature) : null;
      const registered = Boolean(record && publicKey && record.public_key === publicKey);

      if (registered && record) {
        const revocation = { revokedAt: record.revoked_at, revocationReason: record.revocation_reason };
        const storedCms = record.cms_signature ? Buffer.from(record.cms_signature, 'base64') : null;
        if (storedCms && isCmsSignedData(storedCms)) {
          const bundle = await cryptoService.verifyBundle(file.buffer, file.originalname, record.cms_signature!, {
            timestampToken: record.timestamp_token,
            signedAt: record.timestamp,
            requireHybrid: record.hybrid,
          });
          res.status(200).json(buildVerificationResult(bundle, {
            method: 'registry', signedAt: record.timestamp, ...revocation,
          }));
          return;
        }
        const raw = await cryptoService.verifySignature(
          file.buffer, file.originalname, signature, record.public_key, record.algorithm,
        );
        res.status(200).json(buildVerificationResult(raw, {
          method: 'registry',
          signedAt: record.timestamp,
          reason: raw.valid ? undefined : 'El documento no coincide con la firma registrada',
          ...revocation,
        }));
        return;
      }

      if (cms) {
        const bundle = await cryptoService.verifyBundle(file.buffer, file.originalname, cms, {
          timestampToken,
          requireHybrid: parseBoolean(req.body?.hybrid, false) === true,
        });
        res.status(200).json(buildVerificationResult(bundle, { method: 'certificate_chain' }));
        return;
      }

      if (certificate) {
        const x509 = await cryptoService.verifySignatureX509(
          file.buffer, file.originalname, signature, certificate,
        );
        res.status(200).json(buildVerificationResult(x509, { method: 'certificate_chain' }));
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
   * Verify the signatures embedded in a PDF (public)
   * POST /api/documents/verify-pdf
   */
  async verifyPdf(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Bad Request', message: 'No file provided' });
        return;
      }
      const result = await cryptoService.verifyPdf(req.file.buffer, req.file.originalname);
      const record = await Signature.findOne({
        where: { signed_pdf_hash: storageService.calculateHash(req.file.buffer) },
      });
      res.status(200).json(buildPdfVerificationResult(result, {
        revokedAt: record?.revoked_at,
        revocationReason: record?.revocation_reason,
      }));
    } catch (error: any) {
      if (error instanceof CryptoInputError) {
        res.status(400).json({ error: 'Bad Request', message: error.message });
        return;
      }
      console.error('Verify PDF error:', error);
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to verify PDF' });
    }
  }

  /**
   * Revoke one of the caller's signatures
   * POST /api/documents/:id/signatures/:signatureId/revoke
   */
  async revokeSignature(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }
      const reason = req.body?.reason || 'unspecified';
      if (!REVOCATION_REASONS.includes(reason)) {
        res.status(400).json({
          error: 'Bad Request',
          message: `Unsupported reason. Supported: ${REVOCATION_REASONS.join(', ')}`,
        });
        return;
      }

      const document = await Document.findOne({ where: { id: req.params.id, user_id: req.userId } });
      const signature = document
        ? await Signature.findOne({ where: { id: req.params.signatureId, document_id: document.id } })
        : null;
      if (!document || !signature) {
        res.status(404).json({ error: 'Not Found', message: 'Signature not found' });
        return;
      }
      if (signature.revoked_at) {
        res.status(409).json({ error: 'Conflict', message: 'Signature already revoked' });
        return;
      }

      for (const cert of [signature.signer_cert, signature.classical_cert]) {
        if (cert) await cryptoService.revokeCertificate(cert, reason);
      }
      await signature.update({ revoked_at: new Date(), revocation_reason: reason });

      console.log(`⛔ Signature revoked: ${signature.id} (${reason})`);
      res.status(200).json({ message: 'Signature revoked', signature: signature.toSafeJSON() });
    } catch (error: any) {
      if (error instanceof CryptoInputError) {
        res.status(400).json({ error: 'Bad Request', message: error.message });
        return;
      }
      console.error('Revoke signature error:', error);
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to revoke signature' });
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
        const isLegacy = !sig.issuer_cert;

        let trust: TrustMaterial | null = null;
        if (sig.signer_cert) {
          try {
            trust = await cryptoService.getTrustMaterial();
          } catch (caError) {
            console.warn('Trust material unavailable for bundle:', caError);
          }
        }
        const caCertificate = trust ? (isLegacy ? trust.legacy_pem : trust.root_pem) : null;

        const signedPdf = sig.signed_pdf_path ? await storageService.loadFilePath(sig.signed_pdf_path) : null;
        let sealedPdf: Buffer | null = null;
        if (isPdf && !signedPdf) {
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
          hasClassical: Boolean(sig.classical_cert),
          hasIntermediate: Boolean(sig.issuer_cert),
          hasCa: Boolean(caCertificate),
          hasTsa: Boolean(sig.timestamp_token && trust),
          hasCmsField: Boolean(cmsBuffer),
          cmsIsReal: Boolean(cmsBuffer && isCmsSignedData(cmsBuffer)),
          hasTimestamp: Boolean(sig.timestamp_token),
          signedPdf: Boolean(signedPdf),
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

        const entries: Array<[string | undefined, Buffer | string | null | undefined]> = [
          [files.original, fileBuffer],
          [files.signedPdf, signedPdf],
          [files.sealedCopy, sealedPdf],
          [files.certificateJson, JSON.stringify(buildCertificateJson(document, sig, files), null, 2)],
          [files.signerCertificate, sig.signer_cert],
          [files.classicalCertificate, sig.classical_cert],
          [files.intermediateCertificate, sig.issuer_cert],
          [files.caCertificate, caCertificate],
          [files.tsaCertificate, trust?.tsa_pem],
          [files.cms ?? files.legacyRawSignature, cmsBuffer],
          [files.timestampToken, sig.timestamp_token ? Buffer.from(sig.timestamp_token, 'base64') : null],
          ['VERIFY.md', buildVerifyMarkdown(sig, files)],
        ];
        for (const [name, content] of entries) {
          if (name && content) archive.append(content, { name });
        }

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
