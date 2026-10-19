/**
 * Envelope controller: who can invite signers, the OTP gate, sequential
 * ordering, quota enforcement, and envelope-completion notifications.
 * Models and external services are mocked; otp.service runs for real so the
 * OTP hash/verify roundtrip is actually exercised.
 */

jest.mock('../../src/models/document.model', () => ({ Document: { findOne: jest.fn(), findByPk: jest.fn() } }));
jest.mock('../../src/models/signature.model', () => ({ Signature: { create: jest.fn(), count: jest.fn() } }));
jest.mock('../../src/models/user.model', () => ({ User: { findByPk: jest.fn() } }));
jest.mock('../../src/models/envelope.model', () => ({
  Envelope: { create: jest.fn(), findOne: jest.fn(), findByPk: jest.fn(), findAll: jest.fn() },
}));
jest.mock('../../src/models/envelope-signer.model', () => ({
  EnvelopeSigner: { create: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../../src/services/crypto.service', () => {
  class CryptoInputError extends Error {}
  return { CryptoInputError, cryptoService: { signDocumentX509: jest.fn() } };
});
jest.mock('../../src/services/storage.service', () => ({
  storageService: { loadFilePath: jest.fn(), calculateHash: jest.fn(), saveFile: jest.fn() },
}));
jest.mock('../../src/services/email.service', () => {
  class EmailNotConfiguredError extends Error {}
  return {
    EmailNotConfiguredError,
    emailService: {
      sendSignerInvite: jest.fn(),
      sendOtpCode: jest.fn(),
      sendNextSignerTurn: jest.fn(),
      sendEnvelopeCompleted: jest.fn(),
    },
  };
});

import { envelopesController } from '../../src/controllers/envelopes.controller';
import { Document } from '../../src/models/document.model';
import { Signature } from '../../src/models/signature.model';
import { User } from '../../src/models/user.model';
import { Envelope } from '../../src/models/envelope.model';
import { EnvelopeSigner } from '../../src/models/envelope-signer.model';
import { cryptoService } from '../../src/services/crypto.service';
import { storageService } from '../../src/services/storage.service';
import { emailService } from '../../src/services/email.service';
import { hashSecret } from '../../src/services/otp.service';

const mocked = <T>(fn: T) => fn as unknown as jest.Mock;
const body = (res: any) => res.json.mock.calls[0][0];

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

/** Mimics a Sequelize instance well enough for controller code: plain fields + a mutating .update(). */
function row(fields: Record<string, any>): any {
  const instance: any = { ...fields };
  instance.update = jest.fn(async (patch: Record<string, any>) => {
    Object.assign(instance, patch);
    return instance;
  });
  return instance;
}

const OWNER = row({ id: 'owner-1', email: 'owner@example.com', plan: 'free', fullName: 'Rene Owner' });
const DOC = row({
  id: 'doc-1', filename: 'contrato.pdf', original_path: '/u/contrato.pdf', file_hash: 'hash-1', user_id: 'owner-1',
  update: undefined,
});

function makeEnvelope(overrides: Record<string, any> = {}) {
  const instance = row({
    id: 'env-1', document_id: 'doc-1', owner_user_id: 'owner-1', country: 'CL', algorithm: 'ML-DSA-44',
    hybrid: true, mode: 'parallel', status: 'sent',
    document: DOC,
    signers: [] as any[],
    ...overrides,
  });
  instance.toSafeJSON = () => ({
    id: instance.id, document_id: instance.document_id, status: instance.status, mode: instance.mode,
    signers: (instance.signers ?? []).map((s: any) => s.toOwnerJSON()),
  });
  return instance;
}

function makeSigner(overrides: Record<string, any> = {}) {
  const instance = row({
    id: 'sig-row-1', envelope_id: 'env-1', name: 'Firmante', email: 'firmante@example.com',
    order_index: 1, status: 'notified', access_token_hash: hashSecret('tok'),
    access_token_expires_at: new Date(Date.now() + 3600_000),
    otp_code_hash: null, otp_sent_at: null, otp_expires_at: null, otp_attempts: 0, otp_verified_at: null,
    isAccessTokenExpired: false, isOtpVerifiedRecently: false,
    ...overrides,
  });
  instance.toOwnerJSON = () => ({ id: instance.id, name: instance.name, email: instance.email, status: instance.status });
  instance.toPublicJSON = () => ({ name: instance.name, email: instance.email, order_index: instance.order_index, status: instance.status });
  return instance;
}

const signResponse = (overrides: Record<string, unknown> = {}) => ({
  document_hash: 'hash-1',
  algorithm: 'ML-DSA-44',
  public_key: 'pk',
  signature: 'sig',
  timestamp: '2026-10-20T10:00:00+00:00',
  valid_until: '2027-10-20T10:00:00+00:00',
  quantum_safe: true,
  signature_size: 2420,
  country: 'CL',
  hybrid: false,
  classical: null,
  time_stamp: { token: 'TST', gen_time: '2026-10-20T10:00:01+00:00', serial: '1', policy: '2.25.1' },
  signed_pdf: null,
  pki: { signer_cert_pem: 'PEM', issuer_cert_pem: 'ISSUER', cms_signature_b64: 'CMS', certificate: { serial: 'ABC' } },
  ...overrides,
});

beforeEach(() => {
  jest.resetAllMocks();
  mocked(storageService.calculateHash).mockReturnValue('hash-1');
});

describe('createEnvelope', () => {
  const req = (overrides: Record<string, any>) => ({ userId: 'owner-1', body: {}, ...overrides } as any);

  it('rejects inviting others on the free plan', async () => {
    mocked(User.findByPk).mockResolvedValue(OWNER);
    const res = mockRes();

    await envelopesController.createEnvelope(
      req({ body: { document_id: 'doc-1', signers: [{ name: 'Otro', email: 'otro@example.com' }] } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(Envelope.create).not.toHaveBeenCalled();
  });

  it('allows a free-plan user to sign only their own document', async () => {
    mocked(User.findByPk).mockResolvedValue(OWNER);
    mocked(Document.findOne).mockResolvedValue(DOC);
    const created = makeEnvelope({ status: 'sent' });
    mocked(Envelope.create).mockResolvedValue(created);
    mocked(EnvelopeSigner.create).mockResolvedValue(makeSigner());
    mocked(Envelope.findByPk).mockResolvedValue(makeEnvelope({ signers: [makeSigner()] }));
    const res = mockRes();

    await envelopesController.createEnvelope(
      req({ body: { document_id: 'doc-1', signers: [{ name: 'Rene Owner', email: 'owner@example.com' }] } }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(body(res).envelope).toBeDefined();
  });

  it('parallel mode notifies every signer immediately', async () => {
    mocked(User.findByPk).mockResolvedValue({ ...OWNER, plan: 'basic' });
    mocked(Document.findOne).mockResolvedValue(DOC);
    mocked(Envelope.create).mockResolvedValue(makeEnvelope());
    mocked(EnvelopeSigner.create)
      .mockResolvedValueOnce(makeSigner({ id: 's1', order_index: 1, email: 'a@example.com' }))
      .mockResolvedValueOnce(makeSigner({ id: 's2', order_index: 2, email: 'b@example.com' }));
    mocked(Envelope.findByPk).mockResolvedValue(makeEnvelope());
    const res = mockRes();

    await envelopesController.createEnvelope(
      req({
        body: {
          document_id: 'doc-1', mode: 'parallel',
          signers: [{ name: 'A', email: 'a@example.com' }, { name: 'B', email: 'b@example.com' }],
        },
      }),
      res,
    );

    expect(emailService.sendSignerInvite).toHaveBeenCalledTimes(2);
  });

  it('sequential mode notifies only the first signer', async () => {
    mocked(User.findByPk).mockResolvedValue({ ...OWNER, plan: 'basic' });
    mocked(Document.findOne).mockResolvedValue(DOC);
    mocked(Envelope.create).mockResolvedValue(makeEnvelope({ mode: 'sequential' }));
    mocked(EnvelopeSigner.create)
      .mockResolvedValueOnce(makeSigner({ id: 's1', order_index: 1, email: 'a@example.com' }))
      .mockResolvedValueOnce(makeSigner({ id: 's2', order_index: 2, email: 'b@example.com' }));
    mocked(Envelope.findByPk).mockResolvedValue(makeEnvelope({ mode: 'sequential' }));
    const res = mockRes();

    await envelopesController.createEnvelope(
      req({
        body: {
          document_id: 'doc-1', mode: 'sequential',
          signers: [{ name: 'A', email: 'a@example.com' }, { name: 'B', email: 'b@example.com' }],
        },
      }),
      res,
    );

    expect(emailService.sendSignerInvite).toHaveBeenCalledTimes(1);
    expect(mocked(emailService.sendSignerInvite).mock.calls[0][0]).toMatchObject({ to: 'a@example.com' });
  });

  it('rejects an unsupported algorithm/country/mode before touching the database', async () => {
    const res = mockRes();
    await envelopesController.createEnvelope(req({ body: { document_id: 'doc-1', algorithm: 'RSA-2048', signers: [{ name: 'A', email: 'a@b.com' }] } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(User.findByPk).not.toHaveBeenCalled();
  });

  it('404s when the document does not belong to the caller', async () => {
    mocked(User.findByPk).mockResolvedValue(OWNER);
    mocked(Document.findOne).mockResolvedValue(null);
    const res = mockRes();
    await envelopesController.createEnvelope(req({ body: { document_id: 'doc-x', signers: [{ name: 'Rene Owner', email: 'owner@example.com' }] } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('getPublicSigner', () => {
  const req = (token = 'tok') => ({ params: { token } } as any);

  it('404s for an unknown token', async () => {
    mocked(EnvelopeSigner.findOne).mockResolvedValue(null);
    const res = mockRes();
    await envelopesController.getPublicSigner(req(), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('410s when the envelope was voided', async () => {
    mocked(EnvelopeSigner.findOne).mockResolvedValue(makeSigner({ envelope: makeEnvelope({ status: 'voided' }) }));
    const res = mockRes();
    await envelopesController.getPublicSigner(req(), res);
    expect(res.status).toHaveBeenCalledWith(410);
  });

  it('410s when the access token expired', async () => {
    mocked(EnvelopeSigner.findOne).mockResolvedValue(makeSigner({ envelope: makeEnvelope(), isAccessTokenExpired: true }));
    const res = mockRes();
    await envelopesController.getPublicSigner(req(), res);
    expect(res.status).toHaveBeenCalledWith(410);
  });

  it('marks a first view and returns the signer/document info', async () => {
    const signer = makeSigner({ envelope: makeEnvelope(), status: 'notified' });
    mocked(EnvelopeSigner.findOne).mockResolvedValue(signer);
    mocked(User.findByPk).mockResolvedValue(OWNER);
    const res = mockRes();

    await envelopesController.getPublicSigner(req(), res);

    expect(signer.status).toBe('viewed');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(body(res).document.filename).toBe('contrato.pdf');
  });
});

describe('requestOtp', () => {
  const req = (token = 'tok') => ({ params: { token } } as any);

  it('enforces a cooldown between code requests', async () => {
    const signer = makeSigner({ envelope: makeEnvelope(), otp_sent_at: new Date() });
    mocked(EnvelopeSigner.findOne).mockResolvedValue(signer);
    const res = mockRes();
    await envelopesController.requestOtp(req(), res);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(emailService.sendOtpCode).not.toHaveBeenCalled();
  });

  it('sends a 6-digit code and stores only its hash', async () => {
    const signer = makeSigner({ envelope: makeEnvelope() });
    mocked(EnvelopeSigner.findOne).mockResolvedValue(signer);
    const res = mockRes();

    await envelopesController.requestOtp(req(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const sent = mocked(emailService.sendOtpCode).mock.calls[0][0];
    expect(sent.code).toMatch(/^\d{6}$/);
    expect(signer.otp_code_hash).not.toBe(sent.code);
  });

  it('refuses once the signer already signed', async () => {
    const signer = makeSigner({ envelope: makeEnvelope(), status: 'signed' });
    mocked(EnvelopeSigner.findOne).mockResolvedValue(signer);
    const res = mockRes();
    await envelopesController.requestOtp(req(), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe('verifyOtp', () => {
  const req = (code: string, token = 'tok') => ({ params: { token }, body: { code } } as any);

  it('accepts the correct code and marks the signer verified', async () => {
    const signer = makeSigner({
      envelope: makeEnvelope(), otp_code_hash: hashSecret('111111'),
      otp_expires_at: new Date(Date.now() + 60_000), otp_attempts: 0,
    });
    mocked(EnvelopeSigner.findOne).mockResolvedValue(signer);
    const res = mockRes();

    await envelopesController.verifyOtp(req('111111'), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(signer.otp_verified_at).toBeInstanceOf(Date);
    expect(signer.status).toBe('otp_verified');
    expect(signer.otp_code_hash).toBeNull();
  });

  it('rejects a wrong code and increments attempts', async () => {
    const signer = makeSigner({
      envelope: makeEnvelope(), otp_code_hash: hashSecret('111111'),
      otp_expires_at: new Date(Date.now() + 60_000), otp_attempts: 2,
    });
    mocked(EnvelopeSigner.findOne).mockResolvedValue(signer);
    const res = mockRes();

    await envelopesController.verifyOtp(req('000000'), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(signer.otp_attempts).toBe(3);
  });

  it('blocks further attempts once the limit is reached', async () => {
    const signer = makeSigner({
      envelope: makeEnvelope(), otp_code_hash: hashSecret('111111'),
      otp_expires_at: new Date(Date.now() + 60_000), otp_attempts: 5,
    });
    mocked(EnvelopeSigner.findOne).mockResolvedValue(signer);
    const res = mockRes();

    await envelopesController.verifyOtp(req('111111'), res);

    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('rejects an expired code', async () => {
    const signer = makeSigner({
      envelope: makeEnvelope(), otp_code_hash: hashSecret('111111'),
      otp_expires_at: new Date(Date.now() - 1000), otp_attempts: 0,
    });
    mocked(EnvelopeSigner.findOne).mockResolvedValue(signer);
    const res = mockRes();

    await envelopesController.verifyOtp(req('111111'), res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('signAsEnvelopeSigner', () => {
  const req = (token = 'tok') => ({ params: { token }, ip: '203.0.113.1', headers: { 'user-agent': 'jest' } } as any);

  function arrangeCrypto() {
    mocked(storageService.loadFilePath).mockResolvedValue(Buffer.from('contrato'));
    mocked(cryptoService.signDocumentX509).mockResolvedValue(signResponse());
    mocked(Document.findByPk).mockResolvedValue(DOC);
    mocked(User.findByPk).mockResolvedValue(OWNER);
    mocked(Signature.count).mockResolvedValue(0);
    mocked(Signature.create).mockResolvedValue(row({ id: 'signature-1', toSafeJSON: () => ({ id: 'signature-1' }) }));
  }

  it('requires a recent OTP verification before signing', async () => {
    const signer = makeSigner({ envelope: makeEnvelope({ signers: [] }), isOtpVerifiedRecently: false });
    mocked(EnvelopeSigner.findOne).mockResolvedValue(signer);
    const res = mockRes();

    await envelopesController.signAsEnvelopeSigner(req(), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(cryptoService.signDocumentX509).not.toHaveBeenCalled();
  });

  it('blocks a sequential signer whose turn has not come', async () => {
    const first = makeSigner({ id: 'first', order_index: 1, status: 'notified' });
    const second = makeSigner({ id: 'second', order_index: 2, isOtpVerifiedRecently: true });
    const envelope = makeEnvelope({ mode: 'sequential', signers: [first, second] });
    second.envelope = envelope;
    mocked(EnvelopeSigner.findOne).mockResolvedValue(second);
    const res = mockRes();

    await envelopesController.signAsEnvelopeSigner(req(), res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('signs, completes the envelope and notifies the owner when it was the only signer', async () => {
    arrangeCrypto();
    const signer = makeSigner({ isOtpVerifiedRecently: true });
    const envelope = makeEnvelope({ signers: [signer] });
    signer.envelope = envelope;
    mocked(EnvelopeSigner.findOne).mockResolvedValue(signer);
    const res = mockRes();

    await envelopesController.signAsEnvelopeSigner(req(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(signer.status).toBe('signed');
    expect(signer.verified_ip).toBe('203.0.113.1');
    expect(envelope.status).toBe('completed');
    expect(emailService.sendEnvelopeCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ to: OWNER.email }),
    );
  });

  it('advances to the next signer in a sequential envelope instead of completing', async () => {
    arrangeCrypto();
    const first = makeSigner({ id: 'first', order_index: 1, isOtpVerifiedRecently: true });
    const second = makeSigner({ id: 'second', order_index: 2, status: 'pending' });
    const envelope = makeEnvelope({ mode: 'sequential', signers: [first, second] });
    first.envelope = envelope;
    mocked(EnvelopeSigner.findOne).mockResolvedValue(first);
    const res = mockRes();

    await envelopesController.signAsEnvelopeSigner(req(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(envelope.status).not.toBe('completed');
    expect(second.status).toBe('notified');
    expect(emailService.sendNextSignerTurn).toHaveBeenCalledWith(
      expect.objectContaining({ to: second.email }),
    );
    expect(emailService.sendEnvelopeCompleted).not.toHaveBeenCalled();
  });

  it("rejects once the owner's monthly quota is exhausted", async () => {
    arrangeCrypto();
    mocked(Signature.count).mockResolvedValue(5); // free plan limit
    const signer = makeSigner({ isOtpVerifiedRecently: true });
    signer.envelope = makeEnvelope({ signers: [signer] });
    mocked(EnvelopeSigner.findOne).mockResolvedValue(signer);
    const res = mockRes();

    await envelopesController.signAsEnvelopeSigner(req(), res);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(cryptoService.signDocumentX509).not.toHaveBeenCalled();
  });

  it('refuses to sign when the stored file fails its integrity check', async () => {
    arrangeCrypto();
    mocked(storageService.calculateHash).mockReturnValue('tampered-hash');
    const signer = makeSigner({ isOtpVerifiedRecently: true });
    signer.envelope = makeEnvelope({ signers: [signer] });
    mocked(EnvelopeSigner.findOne).mockResolvedValue(signer);
    const res = mockRes();

    await envelopesController.signAsEnvelopeSigner(req(), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(cryptoService.signDocumentX509).not.toHaveBeenCalled();
  });

  it('409s if the signer already signed', async () => {
    const signer = makeSigner({ status: 'signed', isOtpVerifiedRecently: true });
    signer.envelope = makeEnvelope({ signers: [signer] });
    mocked(EnvelopeSigner.findOne).mockResolvedValue(signer);
    const res = mockRes();

    await envelopesController.signAsEnvelopeSigner(req(), res);

    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe('declineSigning', () => {
  const req = (reason?: string, token = 'tok') => ({ params: { token }, body: reason ? { reason } : {} } as any);

  it('declines and voids the whole envelope', async () => {
    const signer = makeSigner();
    const envelope = makeEnvelope({ signers: [signer] });
    signer.envelope = envelope;
    mocked(EnvelopeSigner.findOne).mockResolvedValue(signer);
    const res = mockRes();

    await envelopesController.declineSigning(req('No estoy de acuerdo'), res);

    expect(signer.status).toBe('declined');
    expect(envelope.status).toBe('voided');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('cannot decline after already signing', async () => {
    const signer = makeSigner({ status: 'signed' });
    signer.envelope = makeEnvelope({ signers: [signer] });
    mocked(EnvelopeSigner.findOne).mockResolvedValue(signer);
    const res = mockRes();

    await envelopesController.declineSigning(req(), res);

    expect(res.status).toHaveBeenCalledWith(409);
  });
});
