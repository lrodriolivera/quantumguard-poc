import type {
  BundleSigner,
  BundleVerificationResponse,
  CertificateSummary,
  PdfVerificationResponse,
  VerificationResponse,
  X509VerificationResponse,
} from '../services/crypto.service';

export const DEFAULT_ALGORITHM = 'ML-DSA-44';

export const SUPPORTED_ALGORITHMS = [
  'ML-DSA-44',
  'ML-DSA-65',
  'ML-DSA-87',
  'SLH-DSA-SHA2-128s',
  'SLH-DSA-SHA2-192s',
  'SLH-DSA-SHA2-256s',
] as const;

export const SUPPORTED_COUNTRIES = ['CL', 'CO', 'ES'] as const;
export const DEFAULT_COUNTRY = 'CL';

export const REVOCATION_REASONS = [
  'unspecified',
  'keyCompromise',
  'affiliationChanged',
  'superseded',
  'cessationOfOperation',
];

const LEGACY_ALIASES: Record<string, string> = {
  Dilithium2: 'ML-DSA-44',
  Dilithium3: 'ML-DSA-65',
  Dilithium5: 'ML-DSA-87',
};

/** Canonical FIPS 204/205 name, or null when the algorithm is not supported. */
export function canonicalAlgorithm(algorithm: unknown): string | null {
  if (typeof algorithm !== 'string') return null;
  const canonical = LEGACY_ALIASES[algorithm] ?? algorithm;
  return (SUPPORTED_ALGORITHMS as readonly string[]).includes(canonical) ? canonical : null;
}

/** Issuing-CA country code, defaulting to Chile; null when unsupported. */
export function parseCountry(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return DEFAULT_COUNTRY;
  if (typeof value !== 'string') return null;
  const code = value.toUpperCase();
  return (SUPPORTED_COUNTRIES as readonly string[]).includes(code) ? code : null;
}

/** Multipart booleans arrive as strings; null means "not a boolean". */
export function parseBoolean(value: unknown, fallback: boolean): boolean | null {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return null;
}

const HTML_ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&amp;': '&',
};

/** Undo sanitizeInputs' HTML escaping so names like O'Brien reach the certificate intact. */
function decodeEntities(value: string): string {
  return value.replace(/&(lt|gt|quot|#x27|amp);/g, (m) => HTML_ENTITIES[m] ?? m);
}

export function signerIdentity(
  user: { first_name?: string | null; last_name?: string | null; email: string } | null,
): { name: string; email: string } {
  if (!user) return { name: '', email: '' };
  const name = decodeEntities([user.first_name, user.last_name].filter(Boolean).join(' ')).trim();
  return { name: name || user.email, email: user.email };
}

export type VerificationMethod = 'certificate_chain' | 'registry';

export function x509InvalidReason(result: X509VerificationResponse): string | undefined {
  if (!result.chain_valid) return 'El certificado no fue emitido por la CA de QuantumGuard';
  if (result.revoked) return 'La firma fue revocada';
  if (!result.signature_valid) return 'El documento fue modificado o la firma no corresponde a este documento';
  if (result.within_validity === false) return 'La firma es de una fecha en que el certificado no estaba vigente';
  return undefined;
}

function isX509(result: VerificationResponse): result is X509VerificationResponse {
  return 'chain_valid' in result;
}

function isBundle(result: VerificationResponse): result is BundleVerificationResponse {
  return 'cms_valid' in result;
}

function signerView(s: CertificateSummary | BundleSigner) {
  return {
    name: s.common_name,
    email: s.email,
    country: s.country ?? null,
    algorithm: s.algorithm,
    serial: s.serial,
    post_quantum: 'post_quantum' in s ? s.post_quantum : true,
  };
}

interface VerificationContext {
  method: VerificationMethod;
  signedAt?: Date;
  reason?: string;
  revokedAt?: Date | null;
  revocationReason?: string | null;
}

export function buildVerificationResult(
  result: VerificationResponse | X509VerificationResponse | BundleVerificationResponse,
  context: VerificationContext,
) {
  const bundle = isBundle(result) ? result : undefined;
  const x509 = isX509(result) ? result : undefined;
  const certificate: CertificateSummary | null | undefined = bundle ? bundle.certificate : x509?.certificate;
  const trusted = bundle ? bundle.cms_valid : x509 ? x509.chain_valid : true;
  const revoked = Boolean(context.revokedAt || bundle?.revoked || x509?.revoked);
  const valid = result.valid && !revoked;

  let reason = context.reason;
  if (!valid && !reason) {
    reason = revoked
      ? 'La firma fue revocada por su titular'
      : bundle?.reason ?? (x509 ? x509InvalidReason(x509) : undefined);
  }
  const stampTime = bundle?.time_stamp?.valid ? bundle.time_stamp.gen_time : null;

  return {
    message: 'Signature verification completed',
    valid,
    trusted,
    verification_method: context.method,
    reason,
    document_hash: result.document_hash,
    algorithm: result.algorithm,
    verification_timestamp: result.verification_timestamp,
    quantum_safe: result.quantum_safe,
    details: result.details,
    signed_at: stampTime ?? context.signedAt?.toISOString(),
    time_stamp: bundle?.time_stamp ?? null,
    hybrid: bundle?.hybrid ?? false,
    revoked,
    revoked_at: context.revokedAt?.toISOString() ?? null,
    revocation_reason: context.revocationReason ?? null,
    signer: certificate && trusted
      ? { name: certificate.common_name, email: certificate.email, country: certificate.country ?? null }
      : undefined,
    signers: trusted && bundle ? bundle.signers.map(signerView) : undefined,
    certificate: certificate && trusted ? certificate : undefined,
  };
}

export function buildPdfVerificationResult(
  result: PdfVerificationResponse,
  registry: { revokedAt?: Date | null; revocationReason?: string | null },
) {
  const revoked = Boolean(registry.revokedAt) || result.signatures.some((s) => s.revoked);
  const valid = result.valid && !revoked;
  const pq = result.signatures.find((s) => s.type === 'signature' && s.post_quantum && s.signer);
  const signers = result.signatures
    .filter((s) => s.type === 'signature' && s.signer)
    .map((s) => signerView(s.signer as BundleSigner));
  return {
    message: 'PDF verification completed',
    valid,
    trusted: Boolean(pq),
    verification_method: 'pdf_embedded',
    reason: valid ? undefined : (revoked ? 'La firma fue revocada por su titular' : result.reason ?? undefined),
    document_hash: result.document_hash,
    algorithm: pq?.algorithm ?? 'desconocido',
    verification_timestamp: result.verification_timestamp,
    quantum_safe: Boolean(pq),
    details: {},
    signed_at: result.timestamp ?? undefined,
    time_stamp: result.timestamp ? { valid: true, gen_time: result.timestamp } : null,
    hybrid: result.hybrid,
    revoked,
    revoked_at: registry.revokedAt?.toISOString() ?? null,
    revocation_reason: registry.revocationReason ?? null,
    signer: pq?.signer
      ? { name: pq.signer.common_name, email: pq.signer.email, country: pq.signer.country ?? null }
      : undefined,
    signers,
  };
}
