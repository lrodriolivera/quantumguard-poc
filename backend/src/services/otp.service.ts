/**
 * OTP Service
 * One-time codes used as the signer's identity/consent evidence for firma
 * simple (Ley 19.799 art. 3 in Chile, Ley 527/1999 art. 7 in Colombia):
 * control of the invited email address at the moment of signing.
 */

import crypto from 'crypto';

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;
export const ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function generateOtpCode(): string {
  const max = 10 ** OTP_LENGTH;
  return crypto.randomInt(0, max).toString().padStart(OTP_LENGTH, '0');
}

export function hashSecret(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Constant-time comparison so a timing side-channel can't leak the code/token. */
export function secretMatches(candidate: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;
  const candidateHash = Buffer.from(hashSecret(candidate), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return candidateHash.length === stored.length && crypto.timingSafeEqual(candidateHash, stored);
}

export function generateAccessToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
