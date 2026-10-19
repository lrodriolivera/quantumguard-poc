/**
 * Signed bundle helpers: file naming, certificate JSON and offline
 * verification instructions for the *_quantum_signed.zip download.
 */

// DER of OID 1.2.840.113549.1.7.2 (id-signedData), the ContentInfo type of a CMS signature.
const CMS_SIGNED_DATA_OID = Buffer.from('06092a864886f70d010702', 'hex');

export interface BundleDocument {
  filename: string;
  file_size: number | string;
  mime_type?: string | null;
  file_hash: string;
}

export interface BundleSignature {
  id: string;
  algorithm: string;
  algorithmDisplay: string;
  quantum_safe: boolean;
  signature_size?: number;
  document_hash: string;
  timestamp: Date;
  valid_until?: Date;
  isValid: boolean;
  public_key: string;
  signature_data: string;
  signer_cert?: string | null;
}

export interface BundleFiles {
  original: string;
  certificateJson: string;
  signerCertificate?: string;
  caCertificate?: string;
  cms?: string;
  legacyRawSignature?: string;
  sealedCopy?: string;
}

/** Legacy signatures stored a raw ML-DSA signature where a CMS was expected. */
export function isCmsSignedData(der: Buffer): boolean {
  return der.length > 16 && der[0] === 0x30 && der.subarray(0, 16).includes(CMS_SIGNED_DATA_OID);
}

/** Strip path components and control characters so ZIP entries cannot escape the extraction dir. */
export function safeEntryName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() || 'documento';
  const cleaned = base.replace(/[\x00-\x1f\x7f]/g, '').replace(/^\.+/, '').trim();
  return cleaned || 'documento';
}

export function baseName(filename: string): string {
  return safeEntryName(filename).replace(/\.[^.]+$/, '') || 'documento';
}

export function standardFor(algorithm: string): string {
  return algorithm.startsWith('SLH-DSA') ? 'NIST FIPS 205 (SLH-DSA)' : 'NIST FIPS 204 (ML-DSA)';
}

export function rfcsFor(algorithm: string): string {
  return algorithm.startsWith('SLH-DSA')
    ? 'RFC 9909 (X.509), RFC 9814 (CMS)'
    : 'RFC 9881 (X.509), RFC 9882 (CMS)';
}

export function buildBundleFiles(
  document: BundleDocument,
  options: { hasCertificate: boolean; hasCa: boolean; cmsIsReal: boolean; hasCmsField: boolean; sealed: boolean },
): BundleFiles {
  const name = safeEntryName(document.filename);
  const base = baseName(document.filename);
  return {
    original: `original_${name}`,
    certificateJson: `${base}_quantum_certificate.json`,
    signerCertificate: options.hasCertificate ? 'signer_certificate.pem' : undefined,
    caCertificate: options.hasCa ? 'ca_certificate.pem' : undefined,
    cms: options.hasCmsField && options.cmsIsReal ? 'signature.p7s' : undefined,
    legacyRawSignature: options.hasCmsField && !options.cmsIsReal ? 'signature.sig' : undefined,
    sealedCopy: options.sealed ? `${base}_sellado_visual.pdf` : undefined,
  };
}

export function buildCertificateJson(
  document: BundleDocument,
  sig: BundleSignature,
  files: BundleFiles,
): Record<string, unknown> {
  return {
    quantum_signature_certificate: {
      version: '2.0',
      issuer: 'QuantumGuard AI - Post Cuantica Lab',
      standard: standardFor(sig.algorithm),
      rfc: rfcsFor(sig.algorithm),
    },
    document: {
      filename: document.filename,
      signed_file: files.original,
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
      certificate_valid_until: sig.valid_until,
      certificate_in_force: sig.isValid,
      public_key: sig.public_key,
      signature_data: sig.signature_data,
    },
    verification: {
      instructions:
        'Upload this ZIP to the QuantumGuard verifier, or verify offline with OpenSSL 3.5+ as described in VERIFY.md. ' +
        'Trust comes from signer_certificate.pem chaining to ca_certificate.pem, not from the public_key field alone.',
      endpoint: '/api/documents/verify',
      signer_certificate: files.signerCertificate ?? null,
      ca_certificate: files.caCertificate ?? null,
      cms_signature: files.cms ?? null,
    },
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildVerifyMarkdown(sig: BundleSignature, files: BundleFiles): string {
  const attime = Math.floor(new Date(sig.timestamp).getTime() / 1000);
  const original = shellQuote(files.original);
  const lines: string[] = [
    '# Verificación de Firma Post-Cuántica',
    '## QuantumGuard AI - Post Cuantica Lab',
    '',
    `El archivo firmado es **${files.original}**. La firma cubre sus bytes exactos.`,
  ];
  if (files.sealedCopy) {
    lines.push(
      '',
      `> **${files.sealedCopy}** es una copia visual con sello para imprimir o compartir. ` +
        'No es el archivo firmado: verificarla siempre dará inválido.',
    );
  }
  lines.push(
    '',
    '### 1. Verificar en QuantumGuard',
    'Sube este ZIP completo en la página **Verificar** de QuantumGuard.',
    '',
    '### 2. Verificar sin depender de QuantumGuard (OpenSSL 3.5+)',
    '',
  );
  if (files.signerCertificate && files.caCertificate) {
    lines.push(
      'Certificado del firmante emitido por la CA de QuantumGuard (a la fecha de firma):',
      '```bash',
      `openssl verify -CAfile ca_certificate.pem -attime ${attime} signer_certificate.pem`,
      '```',
      '',
    );
  }
  if (files.cms && files.caCertificate) {
    lines.push(
      'Firma CMS SignedData sobre el documento:',
      '```bash',
      'openssl cms -verify -binary -inform DER \\',
      '  -in signature.p7s \\',
      `  -content ${original} \\`,
      '  -CAfile ca_certificate.pem -purpose any \\',
      `  -attime ${attime} -out /dev/null`,
      '```',
    );
  } else if (files.legacyRawSignature && files.signerCertificate) {
    lines.push(
      'Firma digital (formato heredado, firma cruda con la clave del certificado):',
      '```bash',
      'openssl x509 -in signer_certificate.pem -pubkey -noout > signer_pub.pem',
      'openssl pkeyutl -verify -rawin -pubin -inkey signer_pub.pem \\',
      `  -in ${original} -sigfile signature.sig`,
      '```',
    );
  }
  lines.push(
    '',
    '### Información',
    `- **Algoritmo:** ${sig.algorithm} (${sig.algorithmDisplay})`,
    `- **Estándar:** ${standardFor(sig.algorithm)}`,
    `- **RFC:** ${rfcsFor(sig.algorithm)}`,
    `- **Modo de firma:** ${sig.algorithm.startsWith('SLH-DSA') ? 'SLH-DSA' : 'ML-DSA'} puro sobre el documento completo`,
    `- **Huella SHA3-256 (informativa):** ${sig.document_hash}`,
    `- **Firmado:** ${new Date(sig.timestamp).toISOString()}`,
  );
  if (sig.valid_until) {
    lines.push(`- **Certificado vigente hasta:** ${new Date(sig.valid_until).toISOString()}`);
  }
  lines.push('');
  return lines.join('\n');
}
