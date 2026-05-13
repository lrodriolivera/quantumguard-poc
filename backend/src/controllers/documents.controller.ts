/**
 * Documents Controller
 * Handles document upload, signing, verification, and management
 */

import { Request, Response } from 'express';
import { Document } from '../models/document.model';
import { Signature } from '../models/signature.model';
import { User } from '../models/user.model';
import { cryptoService } from '../services/crypto.service';
import { storageService } from '../services/storage.service';
import archiver from 'archiver';
import crypto from 'crypto';

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
   * Sign a document with quantum-safe cryptography
   * POST /api/documents/:id/sign
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
      const { algorithm = 'Dilithium2' } = req.body;

      if (!req.file) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'No file provided',
        });
        return;
      }

      // Find document
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

      // Sign document with crypto service (try X.509 first, fallback to basic)
      let signatureResponse: any;
      let pkiData: any = null;

      try {
        signatureResponse = await cryptoService.signDocumentX509(
          req.file.buffer,
          req.file.originalname,
          algorithm
        );
        pkiData = signatureResponse.pki || null;
      } catch {
        // Fallback to basic signing if X.509 endpoint not available
        signatureResponse = await cryptoService.signDocument(
          req.file.buffer,
          req.file.originalname,
          algorithm
        );
      }

      // Create signature record
      const signature = await Signature.create({
        document_id: document.id,
        algorithm: signatureResponse.algorithm,
        public_key: signatureResponse.public_key,
        signature_data: signatureResponse.signature,
        document_hash: signatureResponse.document_hash,
        timestamp: new Date(signatureResponse.timestamp),
        valid_until: new Date(signatureResponse.valid_until),
        quantum_safe: signatureResponse.quantum_safe,
        signature_size: signatureResponse.signature_size,
        signer_cert: pkiData?.signer_cert_pem || null,
        cms_signature: pkiData?.cms_signature_b64 || null,
      });

      // Update document status
      await document.update({ status: 'signed' });

      console.log(`✅ Document signed: ${document.filename} with ${algorithm}`);

      res.status(200).json({
        message: 'Document signed successfully',
        document: document.toSafeJSON(),
        signature: signature.toSafeJSON(),
      });
    } catch (error: any) {
      console.error('Sign document error:', error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message || 'Failed to sign document',
      });
    }
  }

  /**
   * Verify a document signature
   * POST /api/documents/verify
   */
  async verifySignature(req: Request, res: Response): Promise<void> {
    try {
      const { signature, publicKey, algorithm = 'Dilithium2' } = req.body;

      if (!req.file) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'No file provided',
        });
        return;
      }

      if (!signature || !publicKey) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Signature and public key are required',
        });
        return;
      }

      // Verify signature with crypto service
      const verificationResponse = await cryptoService.verifySignature(
        req.file.buffer,
        req.file.originalname,
        signature,
        publicKey,
        algorithm
      );

      console.log(`✅ Signature verification: ${verificationResponse.valid ? 'VALID' : 'INVALID'}`);

      res.status(200).json({
        message: 'Signature verification completed',
        ...verificationResponse,
      });
    } catch (error: any) {
      console.error('Verify signature error:', error);

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message || 'Failed to verify signature',
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
        const baseName = document.filename.replace(/\.[^.]+$/, '');

        const certificate = {
          quantum_signature_certificate: {
            version: '1.0',
            issuer: 'QuantumGuard AI - Post Cuantica Lab',
            standard: sig.algorithm.startsWith('SLH-DSA') ? 'NIST FIPS 205 (SLH-DSA)' : 'NIST FIPS 204 (ML-DSA)',
          },
          document: {
            filename: document.filename,
            size_bytes: document.file_size,
            mime_type: document.mime_type,
            sha3_256_hash: document.file_hash,
          },
          signature: {
            id: sig.id,
            algorithm: sig.algorithm,
            algorithm_display: sig.algorithmDisplay,
            quantum_safe: sig.quantum_safe,
            signature_size_bytes: sig.signature_size,
            document_hash: sig.document_hash,
            signed_at: sig.timestamp,
            valid_until: sig.valid_until,
            is_valid: sig.isValid,
            public_key: sig.public_key,
            signature_data: sig.signature_data,
          },
          verification: {
            instructions: 'To verify this signature, upload the original document along with the public_key and signature_data to the QuantumGuard verification endpoint.',
            endpoint: '/api/documents/verify',
          },
        };

        const zipFilename = `${baseName}_quantum_signed.zip`;

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipFilename)}"`);

        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.on('error', (err) => { throw err; });
        archive.pipe(res);

        archive.append(fileBuffer, { name: `original_${document.filename}` });

        // Generate sealed PDF with visual stamp if it's a PDF
        if (document.mime_type === 'application/pdf') {
          try {
            const nistStandard = sig.algorithm.startsWith('SLH-DSA') ? 'FIPS 205 (SLH-DSA)' : 'FIPS 204 (ML-DSA)';
            const sealedPdf = await cryptoService.addPdfSeal(
              fileBuffer,
              document.filename,
              {
                algorithm: sig.algorithm,
                algorithm_display: sig.algorithmDisplay,
                document_hash: sig.document_hash,
                signed_at: sig.timestamp?.toISOString?.() || String(sig.timestamp),
                valid_until: sig.valid_until?.toISOString?.() || String(sig.valid_until),
                signature_id: sig.id,
                oid: '',
                nist_standard: nistStandard,
              },
            );
            archive.append(sealedPdf, { name: document.filename });
          } catch (sealError) {
            console.warn('PDF seal failed, including original only:', sealError);
            archive.append(fileBuffer, { name: document.filename });
          }
        } else {
          archive.append(fileBuffer, { name: document.filename });
        }
        archive.append(JSON.stringify(certificate, null, 2), { name: `${baseName}_quantum_certificate.json` });

        // Add X.509 PKI artifacts if available
        if (sig.signer_cert) {
          archive.append(sig.signer_cert, { name: 'signer_certificate.pem' });
        }
        if (sig.cms_signature) {
          const cmsDer = Buffer.from(sig.cms_signature, 'base64');
          archive.append(cmsDer, { name: 'signature.p7s' });
        }

        // Add CA cert from crypto service if PKI artifacts exist
        if (sig.signer_cert || sig.cms_signature) {
          try {
            const caCertResponse = await cryptoService.healthCheck()
              ? await (await import('axios')).default.get(
                  `${process.env.CRYPTO_SERVICE_URL || 'http://localhost:8001'}/crypto/pki/ca`
                )
              : null;
            if (caCertResponse?.data?.certificate_pem) {
              archive.append(caCertResponse.data.certificate_pem, { name: 'ca_certificate.pem' });
            }
          } catch {
            // CA cert not available, skip
          }

          // Add verification instructions
          const verifyMd = `# Verificacion de Firma Post-Cuantica
## QuantumGuard AI - Post Cuantica Lab

### Verificar con OpenSSL 3.5+
\`\`\`bash
openssl cms -verify \\
  -in signature.p7s \\
  -content ${document.filename} \\
  -CAfile ca_certificate.pem \\
  -inform DER \\
  -binary \\
  -purpose any
\`\`\`

### Informacion
- **Algoritmo:** ${sig.algorithm} (${sig.algorithmDisplay})
- **Estandar:** ${sig.algorithm.startsWith('SLH-DSA') ? 'FIPS 205 (SLH-DSA)' : 'FIPS 204 (ML-DSA)'}
- **RFC:** RFC 9881 (X.509), RFC 9882 (CMS)
- **Hash:** SHA-3-256
- **Firmado:** ${sig.timestamp}
- **Valido hasta:** ${sig.valid_until}
`;
          archive.append(verifyMd, { name: 'VERIFY.md' });
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
