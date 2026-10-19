/**
 * Validation and small pure helpers for the envelope (firma simple) flow —
 * kept separate from the controller so they're easy to unit test.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ENVELOPE_MODES = ['parallel', 'sequential'] as const;
export type EnvelopeModeInput = (typeof ENVELOPE_MODES)[number];
export const MAX_SIGNERS_PER_ENVELOPE = 10;

export interface NormalizedSigner {
  name: string;
  email: string;
  phone?: string;
}

export type SignerValidationError =
  | { field: 'signers'; message: string }
  | { field: 'signer_name'; message: string; index: number }
  | { field: 'signer_email'; message: string; index: number };

export function parseEnvelopeMode(value: unknown): EnvelopeModeInput | null {
  if (value === undefined || value === null || value === '') return 'parallel';
  return (ENVELOPE_MODES as readonly string[]).includes(value as string)
    ? (value as EnvelopeModeInput)
    : null;
}

/**
 * Validates and normalizes the raw `signers` array from a request body.
 * Returns either the normalized list or the first validation error found.
 */
export function normalizeSigners(
  raw: unknown,
): { signers: NormalizedSigner[] } | { error: SignerValidationError } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: { field: 'signers', message: 'At least one signer is required' } };
  }
  if (raw.length > MAX_SIGNERS_PER_ENVELOPE) {
    return {
      error: { field: 'signers', message: `No more than ${MAX_SIGNERS_PER_ENVELOPE} signers per document` },
    };
  }

  const signers: NormalizedSigner[] = [];
  const seenEmails = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i] as Record<string, unknown> | null | undefined;
    const name = String(entry?.name ?? '').trim();
    const email = String(entry?.email ?? '').trim().toLowerCase();
    const rawPhone = entry?.phone;
    const phone = rawPhone ? String(rawPhone).trim() : undefined;

    if (!name || name.length > 255) {
      return { error: { field: 'signer_name', message: 'Each signer needs a name (max 255 chars)', index: i } };
    }
    if (!EMAIL_RE.test(email) || email.length > 255) {
      return { error: { field: 'signer_email', message: `Invalid email for signer ${i + 1}`, index: i } };
    }
    if (seenEmails.has(email)) {
      return { error: { field: 'signer_email', message: `Duplicate signer email: ${email}`, index: i } };
    }
    seenEmails.add(email);
    signers.push({ name, email, phone });
  }

  return { signers };
}

/** True when the only signer is the account owner signing their own document. */
export function isSelfOnlyEnvelope(signers: NormalizedSigner[], ownerEmail: string): boolean {
  return signers.length === 1 && signers[0].email === ownerEmail.trim().toLowerCase();
}
