import {
  buildVerificationResult,
  canonicalAlgorithm,
  signerIdentity,
  x509InvalidReason,
} from '../../src/utils/signature.utils';

describe('canonicalAlgorithm', () => {
  it('maps legacy Dilithium names to FIPS 204 names', () => {
    expect(canonicalAlgorithm('Dilithium2')).toBe('ML-DSA-44');
    expect(canonicalAlgorithm('Dilithium5')).toBe('ML-DSA-87');
  });

  it('accepts SLH-DSA and rejects anything else', () => {
    expect(canonicalAlgorithm('SLH-DSA-SHA2-192s')).toBe('SLH-DSA-SHA2-192s');
    expect(canonicalAlgorithm('RSA-2048')).toBeNull();
    expect(canonicalAlgorithm(undefined)).toBeNull();
    expect(canonicalAlgorithm('toString')).toBeNull();
  });
});

describe('signerIdentity', () => {
  it('uses the full name and undoes input HTML escaping', () => {
    expect(signerIdentity({ first_name: 'Sean', last_name: 'O&#x27;Brien', email: 's@x.io' }))
      .toEqual({ name: "Sean O'Brien", email: 's@x.io' });
  });

  it('falls back to the email when the user has no name', () => {
    expect(signerIdentity({ email: 'a@b.io' })).toEqual({ name: 'a@b.io', email: 'a@b.io' });
  });
});

const base = {
  valid: false,
  signature_valid: true,
  chain_valid: true,
  within_validity: true as boolean | null,
  document_hash: 'h',
  algorithm: 'ML-DSA-44',
  verification_timestamp: 't',
  quantum_safe: true,
  details: {},
  certificate: {
    subject: 'CN=Rene', issuer: 'CN=CA', serial: '01', common_name: 'Rene', email: 'r@x.io',
    not_before: 'a', not_after: 'b', algorithm: 'ML-DSA-44',
  },
};

describe('x509InvalidReason', () => {
  it('explains each failure mode', () => {
    expect(x509InvalidReason({ ...base, chain_valid: false })).toMatch(/CA/);
    expect(x509InvalidReason({ ...base, signature_valid: false })).toMatch(/modificado/);
    expect(x509InvalidReason({ ...base, within_validity: false })).toMatch(/vigente/);
  });
});

describe('buildVerificationResult', () => {
  it('hides signer identity when the certificate is not trusted', () => {
    const r = buildVerificationResult({ ...base, chain_valid: false }, { method: 'certificate_chain' });
    expect(r.trusted).toBe(false);
    expect(r.signer).toBeUndefined();
    expect(r.certificate).toBeUndefined();
  });

  it('exposes signer identity for trusted certificates', () => {
    const r = buildVerificationResult({ ...base, valid: true }, { method: 'certificate_chain' });
    expect(r.signer).toEqual({ name: 'Rene', email: 'r@x.io' });
  });
});
