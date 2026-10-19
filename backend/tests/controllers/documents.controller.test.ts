/**
 * Documents controller: signing, verification trust rules and revocation.
 * Crypto service, storage and models are mocked; the rules under test are
 * which key gets trusted, which bytes get signed and who may revoke.
 */

jest.mock('../../src/models/document.model', () => ({ Document: { findOne: jest.fn() } }));
jest.mock('../../src/models/signature.model', () => ({ Signature: { findOne: jest.fn(), create: jest.fn(), count: jest.fn() } }));
jest.mock('../../src/models/user.model', () => ({ User: { findByPk: jest.fn() } }));
jest.mock('../../src/services/storage.service', () => ({
  storageService: { loadFilePath: jest.fn(), calculateHash: jest.fn(), saveFile: jest.fn() },
}));
jest.mock('../../src/services/crypto.service', () => {
  class CryptoInputError extends Error {}
  return {
    CryptoInputError,
    cryptoService: {
      signDocumentX509: jest.fn(),
      verifySignatureX509: jest.fn(),
      verifySignature: jest.fn(),
      verifyBundle: jest.fn(),
      verifyPdf: jest.fn(),
      revokeCertificate: jest.fn(),
    },
  };
});

import { documentsController } from '../../src/controllers/documents.controller';
import { Document } from '../../src/models/document.model';
import { Signature } from '../../src/models/signature.model';
import { User } from '../../src/models/user.model';
import { storageService } from '../../src/services/storage.service';
import { cryptoService, CryptoInputError } from '../../src/services/crypto.service';

const mocked = <T>(fn: T) => fn as unknown as jest.Mock;

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const body = (res: any) => res.json.mock.calls[0][0];
const file = { buffer: Buffer.from('contenido'), originalname: 'doc.txt' };
const REAL_CMS = Buffer.concat([Buffer.from('3082233c06092a864886f70d010702a0', 'hex'), Buffer.alloc(32)]).toString('base64');

const certificate = { common_name: 'Rene', email: 'rene@example.com', country: 'CL', algorithm: 'ML-DSA-44', serial: '01' };

const bundleResult = (overrides: Record<string, unknown> = {}) => ({
  valid: true,
  reason: null,
  cms_valid: true,
  revoked: false,
  hybrid: true,
  signers: [{ ...certificate, post_quantum: true, revoked: false }, { ...certificate, algorithm: 'ECDSA-P256', post_quantum: false, revoked: false }],
  time_stamp: { valid: true, gen_time: '2026-10-19T10:00:00+00:00' },
  document_hash: 'h',
  algorithm: 'ML-DSA-44',
  verification_timestamp: 't',
  quantum_safe: true,
  details: {},
  certificate,
  ...overrides,
});

const x509Result = (overrides: Record<string, unknown> = {}) => ({
  valid: true, signature_valid: true, chain_valid: true, revoked: false, within_validity: null,
  document_hash: 'h', algorithm: 'ML-DSA-44', verification_timestamp: 't', quantum_safe: true, details: {},
  certificate, ...overrides,
});

beforeEach(() => {
  jest.resetAllMocks();
  mocked(storageService.calculateHash).mockReturnValue('hash-of-upload');
  mocked(Signature.count).mockResolvedValue(0);
});

describe('verifySignature', () => {
  it('rejects a self-made key that is neither certified nor registered', async () => {
    mocked(Signature.findOne).mockResolvedValue(null);
    const res = mockRes();

    await documentsController.verifySignature(
      { file, body: { signature: 'forged', publicKey: 'attacker-key', algorithm: 'ML-DSA-44' } } as any, res,
    );

    expect(cryptoService.verifySignature).not.toHaveBeenCalled();
    expect(body(res)).toMatchObject({ valid: false, trusted: false, verification_method: 'none' });
  });

  it('verifies registered signatures with the stored CMS, time-stamp and hybrid policy', async () => {
    const signedAt = new Date('2026-10-01T00:00:00Z');
    mocked(Signature.findOne).mockResolvedValue({
      public_key: 'stored-key', algorithm: 'ML-DSA-44', timestamp: signedAt, cms_signature: REAL_CMS,
      timestamp_token: 'TST', hybrid: true, revoked_at: null,
    });
    mocked(cryptoService.verifyBundle).mockResolvedValue(bundleResult());
    const res = mockRes();

    await documentsController.verifySignature(
      { file, body: { signature: 'sig', publicKey: 'stored-key', cms: 'client-cms' } } as any, res,
    );

    expect(cryptoService.verifyBundle).toHaveBeenCalledWith(file.buffer, 'doc.txt', REAL_CMS, {
      timestampToken: 'TST', signedAt, requireHybrid: true,
    });
    expect(body(res)).toMatchObject({
      valid: true, trusted: true, verification_method: 'registry', hybrid: true,
      signed_at: '2026-10-19T10:00:00+00:00', signer: { name: 'Rene', country: 'CL' },
    });
    expect(body(res).signers).toHaveLength(2);
  });

  it('reports revoked registered signatures as invalid', async () => {
    mocked(Signature.findOne).mockResolvedValue({
      public_key: 'k', algorithm: 'ML-DSA-44', timestamp: new Date(), cms_signature: REAL_CMS,
      hybrid: false, revoked_at: new Date('2026-10-20T00:00:00Z'), revocation_reason: 'keyCompromise',
    });
    mocked(cryptoService.verifyBundle).mockResolvedValue(bundleResult());
    const res = mockRes();

    await documentsController.verifySignature({ file, body: { signature: 'sig', publicKey: 'k' } } as any, res);

    expect(body(res)).toMatchObject({ valid: false, revoked: true, revocation_reason: 'keyCompromise' });
    expect(body(res).reason).toMatch(/revocada/);
  });

  it('verifies legacy registered signatures with the stored key, never the caller key', async () => {
    mocked(Signature.findOne).mockResolvedValue({
      public_key: 'stored-key', algorithm: 'ML-DSA-65', timestamp: new Date(), cms_signature: Buffer.alloc(2420).toString('base64'),
    });
    mocked(cryptoService.verifySignature).mockResolvedValue({ ...x509Result(), certificate: undefined });
    const res = mockRes();

    await documentsController.verifySignature(
      { file, body: { signature: 'sig', publicKey: 'stored-key', algorithm: 'ML-DSA-44' } } as any, res,
    );

    expect(cryptoService.verifyBundle).not.toHaveBeenCalled();
    expect(cryptoService.verifySignature).toHaveBeenCalledWith(file.buffer, 'doc.txt', 'sig', 'stored-key', 'ML-DSA-65');
    expect(body(res)).toMatchObject({ valid: true, verification_method: 'registry' });
  });

  it('does not accept a registered signature presented with a different key', async () => {
    mocked(Signature.findOne).mockResolvedValue({ public_key: 'stored-key', algorithm: 'ML-DSA-44' });
    const res = mockRes();

    await documentsController.verifySignature({ file, body: { signature: 'sig', publicKey: 'other-key' } } as any, res);

    expect(cryptoService.verifySignature).not.toHaveBeenCalled();
    expect(body(res)).toMatchObject({ valid: false, trusted: false });
  });

  it('verifies an unregistered CMS bundle through the certificate chain', async () => {
    mocked(cryptoService.verifyBundle).mockResolvedValue(bundleResult({ valid: false, cms_valid: false, reason: 'no emitida', certificate: null, signers: [] }));
    const res = mockRes();

    await documentsController.verifySignature({ file, body: { cms: 'CMS', timestampToken: 'TST' } } as any, res);

    expect(cryptoService.verifyBundle).toHaveBeenCalledWith(file.buffer, 'doc.txt', 'CMS', {
      timestampToken: 'TST', requireHybrid: false,
    });
    expect(body(res)).toMatchObject({ valid: false, trusted: false, verification_method: 'certificate_chain' });
    expect(body(res).signer).toBeUndefined();
  });

  it('reports an untrusted certificate as invalid without exposing its identity', async () => {
    mocked(Signature.findOne).mockResolvedValue(null);
    mocked(cryptoService.verifySignatureX509).mockResolvedValue(x509Result({ valid: false, chain_valid: false }));
    const res = mockRes();

    await documentsController.verifySignature({ file, body: { signature: 'sig', certificate: 'PEM' } } as any, res);

    expect(body(res)).toMatchObject({ valid: false, trusted: false, verification_method: 'certificate_chain' });
    expect(body(res).reason).toMatch(/CA de QuantumGuard/);
    expect(body(res).signer).toBeUndefined();
  });

  it('maps crypto-service input errors to 400', async () => {
    mocked(Signature.findOne).mockResolvedValue(null);
    mocked(cryptoService.verifySignatureX509).mockRejectedValue(new CryptoInputError('bad base64'));
    const res = mockRes();

    await documentsController.verifySignature({ file, body: { signature: '!!', certificate: 'x' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('requires a certificate, public key or CMS', async () => {
    const res = mockRes();
    await documentsController.verifySignature({ file, body: { signature: 'sig' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('signDocument', () => {
  const storedDoc = () => ({
    id: 'doc-1',
    filename: 'contrato.pdf',
    original_path: '/uploads/u/contrato.pdf',
    file_hash: 'stored-hash',
    update: jest.fn(),
    toSafeJSON: () => ({ id: 'doc-1' }),
  });

  const signResponse = (overrides: Record<string, unknown> = {}) => ({
    document_hash: 'stored-hash',
    algorithm: 'ML-DSA-44',
    public_key: 'cert-key',
    signature: 'sig',
    timestamp: '2026-10-19T10:00:00+00:00',
    valid_until: '2027-10-19T10:00:00+00:00',
    quantum_safe: true,
    signature_size: 2420,
    country: 'CO',
    hybrid: true,
    classical: { algorithm: 'ECDSA-P256-SHA256', signature: 'ec-sig', cert_pem: 'EC-PEM', certificate: {} },
    time_stamp: { token: 'TST', gen_time: '2026-10-19T10:00:01+00:00', serial: '1', policy: '2.25.1' },
    signed_pdf: Buffer.from('%PDF-signed').toString('base64'),
    pki: { signer_cert_pem: 'PEM', issuer_cert_pem: 'ISSUER', cms_signature_b64: 'CMS', certificate: { serial: 'ABC' } },
    ...overrides,
  });

  function arrangeStored(stored = Buffer.from('pagar 100 EUR')) {
    mocked(Document.findOne).mockResolvedValue(storedDoc());
    mocked(storageService.loadFilePath).mockResolvedValue(stored);
    mocked(storageService.calculateHash).mockReturnValue('stored-hash');
    mocked(User.findByPk).mockResolvedValue({ id: 'owner-1', plan: 'free', first_name: 'Rene', last_name: 'Carreño', email: 'rene@example.com' });
    mocked(Signature.create).mockResolvedValue({ toSafeJSON: () => ({}) });
    mocked(storageService.saveFile).mockResolvedValue({ filePath: '/uploads/u/contrato_firmado.pdf', hash: 'pdf-hash' });
    return stored;
  }

  it('signs the stored bytes with the chosen country and hybrid mode, ignoring attached files', async () => {
    const stored = arrangeStored();
    mocked(cryptoService.signDocumentX509).mockResolvedValue(signResponse());
    const res = mockRes();

    await documentsController.signDocument({
      userId: 'u1',
      params: { id: 'doc-1' },
      body: { algorithm: 'Dilithium2', country: 'co', hybrid: 'true' },
      file: { buffer: Buffer.from('pagar 1.000.000 EUR'), originalname: 'x.txt' },
    } as any, res);

    expect(cryptoService.signDocumentX509).toHaveBeenCalledWith(
      stored, 'contrato.pdf', 'ML-DSA-44', { name: 'Rene Carreño', email: 'rene@example.com' },
      { country: 'CO', hybrid: true },
    );
    expect(storageService.saveFile).toHaveBeenCalledWith('u1', Buffer.from('%PDF-signed'), 'contrato_firmado.pdf');
    expect(Signature.create).toHaveBeenCalledWith(expect.objectContaining({
      public_key: 'cert-key', signer_cert: 'PEM', issuer_cert: 'ISSUER', cms_signature: 'CMS',
      country: 'CO', hybrid: true, cert_serial: 'ABC', classical_cert: 'EC-PEM', classical_signature: 'ec-sig',
      timestamp_token: 'TST', timestamp_time: new Date('2026-10-19T10:00:01+00:00'),
      signed_pdf_path: '/uploads/u/contrato_firmado.pdf', signed_pdf_hash: 'pdf-hash',
      valid_until: new Date('2027-10-19T10:00:00+00:00'),
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('defaults to Chile and hybrid signing', async () => {
    arrangeStored();
    mocked(cryptoService.signDocumentX509).mockResolvedValue(signResponse({ signed_pdf: null }));
    const res = mockRes();

    await documentsController.signDocument({ userId: 'u1', params: { id: 'doc-1' }, body: {} } as any, res);

    expect(mocked(cryptoService.signDocumentX509).mock.calls[0][4]).toEqual({ country: 'CL', hybrid: true });
    expect(storageService.saveFile).not.toHaveBeenCalled();
  });

  it.each([
    [{ algorithm: 'RSA-2048' }],
    [{ country: 'PY' }],
    [{ hybrid: 'maybe' }],
  ])('rejects invalid options %j with 400 before touching storage', async (options) => {
    const res = mockRes();
    await documentsController.signDocument({ userId: 'u1', params: { id: 'doc-1' }, body: options } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Document.findOne).not.toHaveBeenCalled();
  });

  it('refuses to sign when the stored file fails its integrity check', async () => {
    mocked(Document.findOne).mockResolvedValue(storedDoc());
    mocked(storageService.loadFilePath).mockResolvedValue(Buffer.from('tampered on disk'));
    mocked(storageService.calculateHash).mockReturnValue('different-hash');
    const res = mockRes();

    await documentsController.signDocument({ userId: 'u1', params: { id: 'doc-1' }, body: {} } as any, res);

    expect(cryptoService.signDocumentX509).not.toHaveBeenCalled();
    expect(Signature.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("rejects once the owner's monthly signature quota is exhausted", async () => {
    arrangeStored();
    mocked(Signature.count).mockResolvedValue(5); // free plan limit
    const res = mockRes();

    await documentsController.signDocument({ userId: 'u1', params: { id: 'doc-1' }, body: {} } as any, res);

    expect(cryptoService.signDocumentX509).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(402);
  });

  it('does not fall back to uncertified signing when the PKI fails', async () => {
    arrangeStored();
    mocked(cryptoService.signDocumentX509).mockRejectedValue(new Error('CA not initialized'));
    const res = mockRes();

    await documentsController.signDocument({ userId: 'u1', params: { id: 'doc-1' }, body: {} } as any, res);

    expect(Signature.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('revokeSignature', () => {
  const req = (reason?: string) => ({
    userId: 'u1', params: { id: 'doc-1', signatureId: 'sig-1' }, body: reason ? { reason } : {},
  } as any);

  it('revokes both certificates of a hybrid signature owned by the caller', async () => {
    const signature = { id: 'sig-1', signer_cert: 'PQ', classical_cert: 'EC', revoked_at: null, update: jest.fn(), toSafeJSON: () => ({}) };
    mocked(Document.findOne).mockResolvedValue({ id: 'doc-1' });
    mocked(Signature.findOne).mockResolvedValue(signature);
    const res = mockRes();

    await documentsController.revokeSignature(req('keyCompromise'), res);

    expect(Document.findOne).toHaveBeenCalledWith({ where: { id: 'doc-1', user_id: 'u1' } });
    expect(cryptoService.revokeCertificate).toHaveBeenCalledWith('PQ', 'keyCompromise');
    expect(cryptoService.revokeCertificate).toHaveBeenCalledWith('EC', 'keyCompromise');
    expect(signature.update).toHaveBeenCalledWith(expect.objectContaining({ revocation_reason: 'keyCompromise' }));
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 404 for documents of other users', async () => {
    mocked(Document.findOne).mockResolvedValue(null);
    const res = mockRes();
    await documentsController.revokeSignature(req(), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(cryptoService.revokeCertificate).not.toHaveBeenCalled();
  });

  it('returns 409 when already revoked', async () => {
    mocked(Document.findOne).mockResolvedValue({ id: 'doc-1' });
    mocked(Signature.findOne).mockResolvedValue({ revoked_at: new Date() });
    const res = mockRes();
    await documentsController.revokeSignature(req(), res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('rejects unknown reasons', async () => {
    const res = mockRes();
    await documentsController.revokeSignature(req('because'), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('does not mark the signature revoked if the CA revocation fails', async () => {
    const signature = { signer_cert: 'PQ', revoked_at: null, update: jest.fn() };
    mocked(Document.findOne).mockResolvedValue({ id: 'doc-1' });
    mocked(Signature.findOne).mockResolvedValue(signature);
    mocked(cryptoService.revokeCertificate).mockRejectedValue(new Error('CA down'));
    const res = mockRes();
    await documentsController.revokeSignature(req(), res);
    expect(signature.update).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('verifyPdf', () => {
  const pdfResult = {
    valid: true, reason: null, hybrid: true, timestamp: '2026-10-19T10:00:00+00:00',
    signatures: [
      { type: 'signature', valid: true, post_quantum: true, algorithm: 'ML-DSA-44', signer: { ...certificate, post_quantum: true } },
      { type: 'signature', valid: true, post_quantum: false, algorithm: 'ECDSA-P256', signer: { ...certificate, algorithm: 'ECDSA-P256' } },
      { type: 'timestamp', valid: true, gen_time: '2026-10-19T10:00:00+00:00' },
    ],
    document_hash: 'h', verification_timestamp: 't',
  };

  it('returns embedded signers and time-stamp', async () => {
    mocked(cryptoService.verifyPdf).mockResolvedValue(pdfResult);
    mocked(Signature.findOne).mockResolvedValue(null);
    const res = mockRes();

    await documentsController.verifyPdf({ file: { buffer: Buffer.from('%PDF'), originalname: 'x.pdf' } } as any, res);

    expect(body(res)).toMatchObject({
      valid: true, hybrid: true, verification_method: 'pdf_embedded', signed_at: pdfResult.timestamp,
      signer: { name: 'Rene' },
    });
    expect(body(res).signers).toHaveLength(2);
  });

  it('honours revocation recorded for that signed PDF', async () => {
    mocked(cryptoService.verifyPdf).mockResolvedValue(pdfResult);
    mocked(Signature.findOne).mockResolvedValue({ revoked_at: new Date(), revocation_reason: 'superseded' });
    const res = mockRes();

    await documentsController.verifyPdf({ file: { buffer: Buffer.from('%PDF'), originalname: 'x.pdf' } } as any, res);

    expect(body(res)).toMatchObject({ valid: false, revoked: true, revocation_reason: 'superseded' });
  });
});
