import type {
  CertificateSummary,
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
  if (!result.signature_valid) return 'El documento fue modificado o la firma no corresponde a este documento';
  if (result.within_validity === false) return 'La firma es de una fecha en que el certificado no estaba vigente';
  return undefined;
}

function isX509(result: VerificationResponse): result is X509VerificationResponse {
  return 'chain_valid' in result;
}

export function buildVerificationResult(
  result: VerificationResponse | X509VerificationResponse,
  context: { method: VerificationMethod; signedAt?: Date; reason?: string },
) {
  const certificate: CertificateSummary | undefined = isX509(result) ? result.certificate : undefined;
  const trusted = isX509(result) ? result.chain_valid : true;
  return {
    message: 'Signature verification completed',
    valid: result.valid,
    trusted,
    verification_method: context.method,
    reason: context.reason,
    document_hash: result.document_hash,
    algorithm: result.algorithm,
    verification_timestamp: result.verification_timestamp,
    quantum_safe: result.quantum_safe,
    details: result.details,
    signed_at: context.signedAt?.toISOString(),
    signer: certificate && trusted
      ? { name: certificate.common_name, email: certificate.email }
      : undefined,
    certificate: certificate && trusted ? certificate : undefined,
  };
}
