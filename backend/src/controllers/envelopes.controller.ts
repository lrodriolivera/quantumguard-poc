/**
 * Envelopes Controller
 * "Firma simple" product: route a document to one or more signers — the
 * account owner and/or people with no QuantumGuard account — who confirm
 * their email with an OTP code before signing.
 */

import { Request, Response } from 'express';
import { Document } from '../models/document.model';
import { Signature } from '../models/signature.model';
import { User } from '../models/user.model';
import { Envelope } from '../models/envelope.model';
import { EnvelopeSigner } from '../models/envelope-signer.model';
import { cryptoService, CryptoInputError } from '../services/crypto.service';
import { storageService } from '../services/storage.service';
import { emailService, EmailNotConfiguredError } from '../services/email.service';
import { signedPdfName } from '../services/bundle.service';
import {
  ACCESS_TOKEN_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  generateAccessToken,
  generateOtpCode,
  hashSecret,
  secretMatches,
} from '../services/otp.service';
import {
  isSelfOnlyEnvelope,
  normalizeSigners,
  parseEnvelopeMode,
} from '../utils/envelope.utils';
import { assertWithinSignatureQuota, planLimits, QuotaExceededError } from '../utils/plan.utils';
import {
  DEFAULT_ALGORITHM,
  SUPPORTED_ALGORITHMS,
  SUPPORTED_COUNTRIES,
  canonicalAlgorithm,
  parseBoolean,
  parseCountry,
} from '../utils/signature.utils';

const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

function handleError(res: Response, error: unknown, fallback: string): void {
  if (error instanceof CryptoInputError) {
    res.status(400).json({ error: 'Bad Request', message: error.message });
    return;
  }
  if (error instanceof EmailNotConfiguredError) {
    console.error('Email service not configured:', error.message);
    res.status(503).json({ error: 'Service Unavailable', message: 'Email delivery is not configured yet' });
    return;
  }
  if (error instanceof QuotaExceededError) {
    res.status(402).json({
      error: 'Payment Required',
      message: `Alcanzaste el límite de ${error.limit} firmas de tu plan ${error.plan} este mes. Actualiza tu plan para seguir firmando.`,
    });
    return;
  }
  console.error(fallback, error);
  res.status(500).json({ error: 'Internal Server Error', message: fallback });
}

async function findSignerByToken(token: string): Promise<EnvelopeSigner | null> {
  if (!token || typeof token !== 'string') return null;
  return EnvelopeSigner.findOne({
    where: { access_token_hash: hashSecret(token) },
    include: [{ model: Envelope, as: 'envelope', include: [{ model: Document, as: 'document' }, { model: EnvelopeSigner, as: 'signers' }] }],
  });
}

export class EnvelopesController {
  // ============================================================
  // Owner-side (authenticated)
  // ============================================================

  /** POST /api/envelopes — create and immediately send the invites. */
  async createEnvelope(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }

      const { document_id, mode: rawMode, country, algorithm, hybrid, signers: rawSigners } = req.body ?? {};

      const algo = canonicalAlgorithm(algorithm || DEFAULT_ALGORITHM);
      const resolvedCountry = parseCountry(country);
      const resolvedHybrid = parseBoolean(hybrid, true);
      const mode = parseEnvelopeMode(rawMode);
      if (!algo || !resolvedCountry || resolvedHybrid === null || !mode) {
        res.status(400).json({
          error: 'Bad Request',
          message: !algo
            ? `Unsupported algorithm. Supported: ${SUPPORTED_ALGORITHMS.join(', ')}`
            : !resolvedCountry
              ? `Unsupported country. Supported: ${SUPPORTED_COUNTRIES.join(', ')}`
              : !mode
                ? "mode must be 'parallel' or 'sequential'"
                : 'hybrid must be true or false',
        });
        return;
      }

      const normalized = normalizeSigners(rawSigners);
      if ('error' in normalized) {
        res.status(400).json({ error: 'Bad Request', message: normalized.error.message });
        return;
      }

      const owner = await User.findByPk(req.userId);
      if (!owner) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
        return;
      }

      const selfOnly = isSelfOnlyEnvelope(normalized.signers, owner.email);
      if (!selfOnly && !planLimits(owner.plan).canInviteSigners) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Tu plan no permite invitar a otras personas a firmar. Actualiza a Basic o Pro.',
        });
        return;
      }

      const document = await Document.findOne({ where: { id: document_id, user_id: req.userId } });
      if (!document) {
        res.status(404).json({ error: 'Not Found', message: 'Document not found' });
        return;
      }
      if (!document.original_path) {
        res.status(409).json({ error: 'Conflict', message: 'Document file not available for signing' });
        return;
      }

      const envelope = await Envelope.create({
        document_id: document.id,
        owner_user_id: req.userId,
        country: resolvedCountry,
        algorithm: algo,
        hybrid: resolvedHybrid,
        mode,
        status: 'sent',
      });

      const now = Date.now();
      const createdSigners: Array<{ row: EnvelopeSigner; token: string }> = [];
      for (let i = 0; i < normalized.signers.length; i++) {
        const token = generateAccessToken();
        const row = await EnvelopeSigner.create({
          envelope_id: envelope.id,
          name: normalized.signers[i].name,
          email: normalized.signers[i].email,
          phone: normalized.signers[i].phone ?? null,
          order_index: i + 1,
          status: 'pending',
          access_token_hash: hashSecret(token),
          access_token_expires_at: new Date(now + ACCESS_TOKEN_TTL_MS),
        });
        createdSigners.push({ row, token });
      }

      // Parallel: notify everyone now. Sequential: only the first signer.
      const toNotify = mode === 'parallel' ? createdSigners : createdSigners.slice(0, 1);
      for (const { row, token } of toNotify) {
        await emailService.sendSignerInvite({
          to: row.email,
          signerName: row.name,
          ownerName: owner.fullName,
          documentName: document.filename,
          token,
        });
        await row.update({ status: 'notified', notified_at: new Date() });
      }

      console.log(`✅ Envelope created: ${envelope.id} (${mode}, ${createdSigners.length} signer(s))`);

      const full = await Envelope.findByPk(envelope.id, { include: [{ model: EnvelopeSigner, as: 'signers' }] });
      res.status(201).json({ message: 'Envelope created and invites sent', envelope: full!.toSafeJSON() });
    } catch (error) {
      handleError(res, error, 'Failed to create envelope');
    }
  }

  /** GET /api/envelopes */
  async listEnvelopes(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }
      const envelopes = await Envelope.findAll({
        where: { owner_user_id: req.userId },
        include: [{ model: EnvelopeSigner, as: 'signers' }, { model: Document, as: 'document' }],
        order: [['created_at', 'DESC']],
      });
      res.status(200).json({ envelopes: envelopes.map((e) => ({ ...e.toSafeJSON(), document: e.document?.toSafeJSON() })) });
    } catch (error) {
      handleError(res, error, 'Failed to list envelopes');
    }
  }

  /** GET /api/envelopes/:id */
  async getEnvelope(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }
      const envelope = await Envelope.findOne({
        where: { id: req.params.id, owner_user_id: req.userId },
        include: [{ model: EnvelopeSigner, as: 'signers' }, { model: Document, as: 'document' }],
      });
      if (!envelope) {
        res.status(404).json({ error: 'Not Found', message: 'Envelope not found' });
        return;
      }
      res.status(200).json({ envelope: { ...envelope.toSafeJSON(), document: envelope.document?.toSafeJSON() } });
    } catch (error) {
      handleError(res, error, 'Failed to get envelope');
    }
  }

  /** POST /api/envelopes/:id/void */
  async voidEnvelope(req: Request, res: Response): Promise<void> {
    try {
      if (!req.userId) {
        res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' });
        return;
      }
      const envelope = await Envelope.findOne({ where: { id: req.params.id, owner_user_id: req.userId } });
      if (!envelope) {
        res.status(404).json({ error: 'Not Found', message: 'Envelope not found' });
        return;
      }
      if (envelope.status === 'completed' || envelope.status === 'voided') {
        res.status(409).json({ error: 'Conflict', message: `Envelope already ${envelope.status}` });
        return;
      }
      await envelope.update({ status: 'voided' });
      res.status(200).json({ message: 'Envelope voided' });
    } catch (error) {
      handleError(res, error, 'Failed to void envelope');
    }
  }

  // ============================================================
  // Public (token-based, no account)
  // ============================================================

  /** GET /api/sign/:token */
  async getPublicSigner(req: Request, res: Response): Promise<void> {
    try {
      const signer = await findSignerByToken(req.params.token);
      if (!signer || !signer.envelope) {
        res.status(404).json({ error: 'Not Found', message: 'Invalid signing link' });
        return;
      }
      if (signer.envelope.status === 'voided') {
        res.status(410).json({ error: 'Gone', message: 'This signing request was cancelled' });
        return;
      }
      if (signer.isAccessTokenExpired) {
        res.status(410).json({ error: 'Gone', message: 'This signing link has expired' });
        return;
      }
      if (signer.status === 'pending' || signer.status === 'notified') {
        await signer.update({ status: 'viewed' });
      }

      const owner = await User.findByPk(signer.envelope.owner_user_id);
      res.status(200).json({
        envelope: { mode: signer.envelope.mode, status: signer.envelope.status },
        document: { filename: signer.envelope.document?.filename ?? 'documento' },
        owner_name: owner?.fullName ?? 'QuantumGuard',
        signer: signer.toPublicJSON(),
      });
    } catch (error) {
      handleError(res, error, 'Failed to load signing link');
    }
  }

  /** POST /api/sign/:token/otp */
  async requestOtp(req: Request, res: Response): Promise<void> {
    try {
      const signer = await findSignerByToken(req.params.token);
      if (!signer || !signer.envelope) {
        res.status(404).json({ error: 'Not Found', message: 'Invalid signing link' });
        return;
      }
      if (signer.envelope.status === 'voided' || signer.isAccessTokenExpired) {
        res.status(410).json({ error: 'Gone', message: 'This signing link is no longer valid' });
        return;
      }
      if (signer.status === 'signed') {
        res.status(409).json({ error: 'Conflict', message: 'You already signed this document' });
        return;
      }
      if (signer.otp_sent_at && Date.now() - signer.otp_sent_at.getTime() < OTP_RESEND_COOLDOWN_MS) {
        res.status(429).json({ error: 'Too Many Requests', message: 'Espera un momento antes de pedir otro código' });
        return;
      }

      const code = generateOtpCode();
      const now = new Date();
      await signer.update({
        otp_code_hash: hashSecret(code),
        otp_sent_at: now,
        otp_expires_at: new Date(now.getTime() + OTP_TTL_MS),
        otp_attempts: 0,
      });
      await emailService.sendOtpCode({ to: signer.email, signerName: signer.name, code });

      res.status(200).json({ message: 'Código enviado', expires_in_seconds: OTP_TTL_MS / 1000 });
    } catch (error) {
      handleError(res, error, 'Failed to send verification code');
    }
  }

  /** POST /api/sign/:token/otp/verify */
  async verifyOtp(req: Request, res: Response): Promise<void> {
    try {
      const signer = await findSignerByToken(req.params.token);
      if (!signer || !signer.envelope) {
        res.status(404).json({ error: 'Not Found', message: 'Invalid signing link' });
        return;
      }
      const code = String(req.body?.code ?? '').trim();
      if (!code) {
        res.status(400).json({ error: 'Bad Request', message: 'code is required' });
        return;
      }
      if (!signer.otp_code_hash || !signer.otp_expires_at || new Date() > signer.otp_expires_at) {
        res.status(400).json({ error: 'Bad Request', message: 'Solicita un nuevo código' });
        return;
      }
      if (signer.otp_attempts >= OTP_MAX_ATTEMPTS) {
        res.status(429).json({ error: 'Too Many Requests', message: 'Demasiados intentos. Solicita un nuevo código' });
        return;
      }
      if (!secretMatches(code, signer.otp_code_hash)) {
        await signer.update({ otp_attempts: signer.otp_attempts + 1 });
        res.status(400).json({ error: 'Bad Request', message: 'Código incorrecto' });
        return;
      }

      await signer.update({
        otp_verified_at: new Date(),
        status: signer.status === 'signed' ? signer.status : 'otp_verified',
        otp_code_hash: null,
        otp_attempts: 0,
      });
      res.status(200).json({ message: 'Identidad verificada' });
    } catch (error) {
      handleError(res, error, 'Failed to verify code');
    }
  }

  /** POST /api/sign/:token/decline */
  async declineSigning(req: Request, res: Response): Promise<void> {
    try {
      const signer = await findSignerByToken(req.params.token);
      if (!signer || !signer.envelope) {
        res.status(404).json({ error: 'Not Found', message: 'Invalid signing link' });
        return;
      }
      if (signer.status === 'signed') {
        res.status(409).json({ error: 'Conflict', message: 'You already signed this document' });
        return;
      }
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 1000) : null;
      await signer.update({ status: 'declined', declined_at: new Date(), decline_reason: reason });
      await signer.envelope.update({ status: 'voided' });
      res.status(200).json({ message: 'Firma rechazada' });
    } catch (error) {
      handleError(res, error, 'Failed to decline signing');
    }
  }

  /** POST /api/sign/:token/sign */
  async signAsEnvelopeSigner(req: Request, res: Response): Promise<void> {
    try {
      const signer = await findSignerByToken(req.params.token);
      if (!signer || !signer.envelope) {
        res.status(404).json({ error: 'Not Found', message: 'Invalid signing link' });
        return;
      }
      const envelope = signer.envelope;
      if (envelope.status === 'voided' || signer.isAccessTokenExpired) {
        res.status(410).json({ error: 'Gone', message: 'This signing link is no longer valid' });
        return;
      }
      if (signer.status === 'signed') {
        res.status(409).json({ error: 'Conflict', message: 'You already signed this document' });
        return;
      }
      if (!signer.isOtpVerifiedRecently) {
        res.status(401).json({ error: 'Unauthorized', message: 'Verifica tu identidad con el código antes de firmar' });
        return;
      }

      const siblings = (envelope.signers ?? []).slice().sort((a, b) => a.order_index - b.order_index);
      if (envelope.mode === 'sequential') {
        const blocking = siblings.find((s) => s.order_index < signer.order_index && s.status !== 'signed');
        if (blocking) {
          res.status(403).json({ error: 'Forbidden', message: 'Aún no es tu turno de firmar' });
          return;
        }
      }

      const document = await Document.findByPk(envelope.document_id);
      if (!document || !document.original_path) {
        res.status(409).json({ error: 'Conflict', message: 'Document file not available for signing' });
        return;
      }

      const fileBuffer = await storageService.loadFilePath(document.original_path);
      if (storageService.calculateHash(fileBuffer) !== document.file_hash) {
        console.error(`Stored file integrity mismatch for document ${document.id}`);
        res.status(500).json({ error: 'Internal Server Error', message: 'Stored document failed its integrity check' });
        return;
      }

      const owner = await User.findByPk(envelope.owner_user_id);
      if (!owner) {
        res.status(500).json({ error: 'Internal Server Error', message: 'Envelope owner not found' });
        return;
      }
      await assertWithinSignatureQuota(owner.id, owner.plan);

      const signed = await cryptoService.signDocumentX509(
        fileBuffer,
        document.filename,
        envelope.algorithm,
        { name: signer.name, email: signer.email },
        { country: envelope.country, hybrid: envelope.hybrid },
      );
      if (signed.document_hash !== document.file_hash) {
        throw new Error('Crypto service signed content that differs from the stored document');
      }

      let signedPdf: { filePath: string; hash: string } | null = null;
      if (signed.signed_pdf) {
        signedPdf = await storageService.saveFile(
          owner.id,
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
      await signer.update({
        status: 'signed',
        signed_at: new Date(),
        signature_id: signature.id,
        verified_ip: req.ip ?? null,
        verified_user_agent: (req.headers['user-agent'] as string)?.slice(0, 500) ?? null,
      });

      const stillPending = siblings.some((s) => s.id !== signer.id && s.status !== 'signed');
      if (!stillPending) {
        await envelope.update({ status: 'completed', completed_at: new Date() });
        try {
          await emailService.sendEnvelopeCompleted({
            to: owner.email,
            ownerName: owner.fullName,
            documentName: document.filename,
          });
        } catch (notifyError) {
          console.warn('Envelope-completed email failed (envelope still marks completed):', notifyError);
        }
      } else if (envelope.mode === 'sequential') {
        const next = siblings
          .filter((s) => s.order_index > signer.order_index && s.status !== 'signed')
          .sort((a, b) => a.order_index - b.order_index)[0];
        if (next) {
          const freshToken = generateAccessToken();
          await next.update({
            access_token_hash: hashSecret(freshToken),
            access_token_expires_at: new Date(Date.now() + ACCESS_TOKEN_TTL_MS),
            status: 'notified',
            notified_at: new Date(),
          });
          try {
            await emailService.sendNextSignerTurn({
              to: next.email,
              signerName: next.name,
              ownerName: owner.fullName,
              documentName: document.filename,
              token: freshToken,
            });
          } catch (notifyError) {
            console.warn('Next-signer-turn email failed (signer can still be re-notified manually):', notifyError);
          }
        }
      }

      console.log(`✅ Envelope signer signed: envelope ${envelope.id}, signer ${signer.id}`);
      res.status(200).json({
        message: 'Document signed successfully',
        signature: signature.toSafeJSON(),
        certificate: signed.pki.certificate,
        envelope_status: stillPending ? 'sent' : 'completed',
      });
    } catch (error) {
      handleError(res, error, 'Failed to sign document');
    }
  }
}

export const envelopesController = new EnvelopesController();
