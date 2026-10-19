/**
 * Documents controller: signing and verification trust rules.
 * Crypto service, storage and models are mocked; the rules under test are
 * which key gets trusted and which bytes get signed.
 */

jest.mock('../../src/models/document.model', () => ({ Document: { findOne: jest.fn() } }));
jest.mock('../../src/models/signature.model', () => ({ Signature: { findOne: jest.fn(), create: jest.fn() } }));
jest.mock('../../src/models/user.model', () => ({ User: { findByPk: jest.fn() } }));
jest.mock('../../src/services/storage.service', () => ({
  storageService: { loadFilePath: jest.fn(), calculateHash: jest.fn() },
}));
jest.mock('../../src/services/crypto.service', () => {
  class CryptoInputError extends Error {}
  return {
    CryptoInputError,
    cryptoService: {
      signDocumentX509: jest.fn(),
      verifySignatureX509: jest.fn(),
      verifySignature: jest.fn(),
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

const file = { buffer: Buffer.from('contenido'), originalname: 'doc.txt' };

const x509Result = (overrides: Record<string, unknown> = {}) => ({
  valid: true,
  signature_valid: true,
  chain_valid: true,
  within_validity: true,
  document_hash: 'h',
  algorithm: 'ML-DSA-44',
  verification_timestamp: '2026-10-19T00:00:00Z',
  quantum_safe: true,
  details: {},
  certificate: { common_name: 'Rene', email: 'rene@example.com' },
  ...overrides,
});

beforeEach(() => {
  jest.resetAllMocks();
  mocked(storageService.calculateHash).mockReturnValue('hash-of-upload');
});

describe('verifySignature', () => {
  it('rejects a self-made key that is neither certified nor registered', async () => {
    mocked(Signature.findOne).mockResolvedValue(null);
    const res = mockRes();

    await documentsController.verifySignature(
      { file, body: { signature: 'forged', publicKey: 'attacker-key', algorithm: 'ML-DSA-44' } } as any,
      res,
    );

    expect(cryptoService.verifySignature).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ valid: false, trusted: false, verification_method: 'none' });
  });

  it('verifies registered signatures with the stored key, never the caller key', async () => {
    mocked(Signature.findOne).mockResolvedValue({
      public_key: 'stored-key', algorithm: 'ML-DSA-65', timestamp: new Date('2026-10-01T00:00:00Z'),
    });
    mocked(cryptoService.verifySignature).mockResolvedValue({ ...x509Result(), certificate: undefined });
    const res = mockRes();

    await documentsController.verifySignature(
      { file, body: { signature: 'sig', publicKey: 'stored-key', algorithm: 'ML-DSA-44' } } as any,
      res,
    );

    expect(cryptoService.verifySignature).toHaveBeenCalledWith(
      file.buffer, 'doc.txt', 'sig', 'stored-key', 'ML-DSA-65',
    );
    expect(res.json.mock.calls[0][0]).toMatchObject({ valid: true, trusted: true, verification_method: 'registry' });
  });

  it('does not accept a registered signature presented with a different key', async () => {
    mocked(Signature.findOne).mockResolvedValue({ public_key: 'stored-key', algorithm: 'ML-DSA-44' });
    const res = mockRes();

    await documentsController.verifySignature(
      { file, body: { signature: 'sig', publicKey: 'other-key' } } as any,
      res,
    );

    expect(cryptoService.verifySignature).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ valid: false, trusted: false });
  });

  it('reports an untrusted certificate as invalid without exposing its identity', async () => {
    mocked(Signature.findOne).mockResolvedValue(null);
    mocked(cryptoService.verifySignatureX509).mockResolvedValue(
      x509Result({ valid: false, chain_valid: false }),
    );
    const res = mockRes();

    await documentsController.verifySignature(
      { file, body: { signature: 'sig', certificate: 'PEM' } } as any,
      res,
    );

    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ valid: false, trusted: false, verification_method: 'certificate_chain' });
    expect(body.reason).toMatch(/CA de QuantumGuard/);
    expect(body.signer).toBeUndefined();
  });

  it('accepts a certificate chained to the CA and passes the registered signing time', async () => {
    const signedAt = new Date('2026-10-02T00:00:00Z');
    mocked(Signature.findOne).mockResolvedValue({ public_key: 'k', timestamp: signedAt });
    mocked(cryptoService.verifySignatureX509).mockResolvedValue(x509Result());
    const res = mockRes();

    await documentsController.verifySignature(
      { file, body: { signature: 'sig', certificate: 'PEM' } } as any,
      res,
    );

    expect(cryptoService.verifySignatureX509).toHaveBeenCalledWith(file.buffer, 'doc.txt', 'sig', 'PEM', signedAt);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      valid: true, trusted: true, signer: { name: 'Rene', email: 'rene@example.com' },
    });
  });

  it('falls back to the registry for legacy bundles whose JSON key differs from the certificate', async () => {
    mocked(Signature.findOne).mockResolvedValue({ public_key: 'legacy-key', algorithm: 'ML-DSA-44', timestamp: new Date() });
    mocked(cryptoService.verifySignatureX509).mockResolvedValue(x509Result({ valid: false, signature_valid: false }));
    mocked(cryptoService.verifySignature).mockResolvedValue({ ...x509Result(), certificate: undefined });
    const res = mockRes();

    await documentsController.verifySignature(
      { file, body: { signature: 'sig', publicKey: 'legacy-key', certificate: 'PEM' } } as any,
      res,
    );

    expect(res.json.mock.calls[0][0]).toMatchObject({ valid: true, verification_method: 'registry' });
  });

  it('maps crypto-service input errors to 400', async () => {
    mocked(Signature.findOne).mockResolvedValue(null);
    mocked(cryptoService.verifySignatureX509).mockRejectedValue(new CryptoInputError('bad base64'));
    const res = mockRes();

    await documentsController.verifySignature({ file, body: { signature: '!!', certificate: 'x' } } as any, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('requires a certificate or public key', async () => {
    const res = mockRes();
    await documentsController.verifySignature({ file, body: { signature: 'sig' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('signDocument', () => {
  const storedDoc = () => ({
    id: 'doc-1',
    filename: 'contrato.txt',
    original_path: '/uploads/u/contrato.txt',
    file_hash: 'stored-hash',
    update: jest.fn(),
    toSafeJSON: () => ({ id: 'doc-1' }),
  });

  const signResponse = {
    document_hash: 'stored-hash',
    algorithm: 'ML-DSA-44',
    public_key: 'cert-key',
    signature: 'sig',
    timestamp: '2026-10-19T10:00:00+00:00',
    valid_until: '2027-10-19T10:00:00+00:00',
    quantum_safe: true,
    signature_size: 2420,
    pki: { signer_cert_pem: 'PEM', cms_signature_b64: 'CMS', certificate: {} },
  };

  it('signs the stored bytes and ignores any file attached to the request', async () => {
    const doc = storedDoc();
    const stored = Buffer.from('pagar 100 EUR');
    mocked(Document.findOne).mockResolvedValue(doc);
    mocked(storageService.loadFilePath).mockResolvedValue(stored);
    mocked(storageService.calculateHash).mockReturnValue('stored-hash');
    mocked(User.findByPk).mockResolvedValue({ first_name: 'Rene', last_name: 'Carreño', email: 'rene@example.com' });
    mocked(cryptoService.signDocumentX509).mockResolvedValue(signResponse);
    mocked(Signature.create).mockResolvedValue({ toSafeJSON: () => ({}) });
    const res = mockRes();

    await documentsController.signDocument({
      userId: 'u1',
      params: { id: 'doc-1' },
      body: { algorithm: 'Dilithium2' },
      file: { buffer: Buffer.from('pagar 1.000.000 EUR'), originalname: 'x.txt' },
    } as any, res);

    expect(cryptoService.signDocumentX509).toHaveBeenCalledWith(
      stored, 'contrato.txt', 'ML-DSA-44', { name: 'Rene Carreño', email: 'rene@example.com' },
    );
    expect(Signature.create).toHaveBeenCalledWith(expect.objectContaining({
      public_key: 'cert-key', signer_cert: 'PEM', cms_signature: 'CMS',
      valid_until: new Date('2027-10-19T10:00:00+00:00'),
    }));
    expect(res.status).toHaveBeenCalledWith(200);
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

  it('rejects unsupported algorithms with 400 before touching storage', async () => {
    const res = mockRes();
    await documentsController.signDocument(
      { userId: 'u1', params: { id: 'doc-1' }, body: { algorithm: 'RSA-2048' } } as any, res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Document.findOne).not.toHaveBeenCalled();
  });

  it('does not fall back to uncertified signing when the PKI fails', async () => {
    mocked(Document.findOne).mockResolvedValue(storedDoc());
    mocked(storageService.loadFilePath).mockResolvedValue(Buffer.from('x'));
    mocked(storageService.calculateHash).mockReturnValue('stored-hash');
    mocked(User.findByPk).mockResolvedValue(null);
    mocked(cryptoService.signDocumentX509).mockRejectedValue(new Error('CA not initialized'));
    const res = mockRes();

    await documentsController.signDocument({ userId: 'u1', params: { id: 'doc-1' }, body: {} } as any, res);

    expect(Signature.create).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
