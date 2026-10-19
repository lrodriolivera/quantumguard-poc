import {
  buildBundleFiles,
  buildCertificateJson,
  buildVerifyMarkdown,
  isCmsSignedData,
  safeEntryName,
} from '../../src/services/bundle.service';

const doc = { filename: 'contrato final.pdf', file_size: 10, mime_type: 'application/pdf', file_hash: 'abc' };
const sig = {
  id: 's1',
  algorithm: 'ML-DSA-44',
  algorithmDisplay: 'ML-DSA-44 (NIST Level 2)',
  quantum_safe: true,
  signature_size: 2420,
  document_hash: 'abc',
  timestamp: new Date('2026-10-19T10:00:00Z'),
  valid_until: new Date('2027-10-19T10:00:00Z'),
  isValid: true,
  public_key: 'pk',
  signature_data: 'sd',
  signer_cert: 'PEM',
};

describe('isCmsSignedData', () => {
  it('detects a CMS ContentInfo with id-signedData', () => {
    const der = Buffer.from('3082233c06092a864886f70d010702a0822329', 'hex');
    expect(isCmsSignedData(Buffer.concat([der, Buffer.alloc(32)]))).toBe(true);
  });

  it('rejects a raw ML-DSA signature', () => {
    expect(isCmsSignedData(Buffer.alloc(2420, 0x41))).toBe(false);
  });
});

describe('safeEntryName', () => {
  it('drops path traversal components', () => {
    expect(safeEntryName('../../etc/passwd')).toBe('passwd');
    expect(safeEntryName('..\\..\\win.ini')).toBe('win.ini');
    expect(safeEntryName('...')).toBe('documento');
  });
});

describe('buildVerifyMarkdown', () => {
  it('points CMS verification at the original file, not the sealed copy', () => {
    const files = buildBundleFiles(doc, { hasCertificate: true, hasCa: true, hasCmsField: true, cmsIsReal: true, sealed: true });
    const md = buildVerifyMarkdown(sig, files);

    expect(files.original).toBe('original_contrato final.pdf');
    expect(files.sealedCopy).toBe('contrato final_sellado_visual.pdf');
    expect(md).toContain("-content 'original_contrato final.pdf'");
    expect(md).toContain(`-attime ${Math.floor(sig.timestamp.getTime() / 1000)}`);
    expect(md).toMatch(/copia visual/);
    expect(md).not.toContain('-content contrato final.pdf');
  });

  it('gives pkeyutl instructions for legacy raw signatures', () => {
    const files = buildBundleFiles(doc, { hasCertificate: true, hasCa: true, hasCmsField: true, cmsIsReal: false, sealed: false });
    const md = buildVerifyMarkdown(sig, files);

    expect(files.cms).toBeUndefined();
    expect(files.legacyRawSignature).toBe('signature.sig');
    expect(md).toContain('openssl pkeyutl -verify -rawin');
    expect(md).not.toContain('openssl cms -verify');
  });

  it('shell-quotes filenames with single quotes', () => {
    const files = buildBundleFiles({ ...doc, filename: "it's.txt" }, { hasCertificate: true, hasCa: true, hasCmsField: true, cmsIsReal: true, sealed: false });
    expect(buildVerifyMarkdown(sig, files)).toContain(`'original_it'\\''s.txt'`);
  });
});

describe('buildCertificateJson', () => {
  it('references the bundle files and states where trust comes from', () => {
    const files = buildBundleFiles(doc, { hasCertificate: true, hasCa: true, hasCmsField: true, cmsIsReal: true, sealed: false });
    const json: any = buildCertificateJson(doc, sig, files);
    expect(json.document.signed_file).toBe('original_contrato final.pdf');
    expect(json.verification.signer_certificate).toBe('signer_certificate.pem');
    expect(json.verification.instructions).toMatch(/chaining to ca_certificate.pem/);
    expect(json.signature.certificate_valid_until).toEqual(sig.valid_until);
  });
});
