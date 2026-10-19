import {
  MAX_SIGNERS_PER_ENVELOPE,
  isSelfOnlyEnvelope,
  normalizeSigners,
  parseEnvelopeMode,
} from '../../src/utils/envelope.utils';

describe('parseEnvelopeMode', () => {
  it('defaults to parallel when omitted', () => {
    expect(parseEnvelopeMode(undefined)).toBe('parallel');
    expect(parseEnvelopeMode('')).toBe('parallel');
  });

  it('accepts parallel and sequential, rejects anything else', () => {
    expect(parseEnvelopeMode('sequential')).toBe('sequential');
    expect(parseEnvelopeMode('parallel')).toBe('parallel');
    expect(parseEnvelopeMode('whenever')).toBeNull();
  });
});

describe('normalizeSigners', () => {
  it('trims and lowercases emails, keeps optional phone', () => {
    const result = normalizeSigners([{ name: '  Rene  ', email: ' Rene@Example.COM ', phone: ' +56 9 1234 ' }]);
    expect('signers' in result && result.signers).toEqual([
      { name: 'Rene', email: 'rene@example.com', phone: '+56 9 1234' },
    ]);
  });

  it('rejects an empty or missing array', () => {
    expect('error' in (normalizeSigners([]) as any)).toBe(true);
    expect('error' in (normalizeSigners(undefined) as any)).toBe(true);
    expect('error' in (normalizeSigners('nope') as any)).toBe(true);
  });

  it(`rejects more than ${MAX_SIGNERS_PER_ENVELOPE} signers`, () => {
    const many = Array.from({ length: MAX_SIGNERS_PER_ENVELOPE + 1 }, (_, i) => ({
      name: `S${i}`, email: `s${i}@example.com`,
    }));
    const result = normalizeSigners(many) as any;
    expect(result.error.field).toBe('signers');
  });

  it('rejects a signer with no name', () => {
    const result = normalizeSigners([{ name: '  ', email: 'a@b.com' }]) as any;
    expect(result.error).toEqual({ field: 'signer_name', message: expect.any(String), index: 0 });
  });

  it('rejects an invalid email', () => {
    const result = normalizeSigners([{ name: 'Rene', email: 'not-an-email' }]) as any;
    expect(result.error.field).toBe('signer_email');
  });

  it('rejects duplicate emails within the same envelope', () => {
    const result = normalizeSigners([
      { name: 'Rene', email: 'rene@example.com' },
      { name: 'Rene Otra Vez', email: 'RENE@example.com' },
    ]) as any;
    expect(result.error).toEqual({ field: 'signer_email', message: expect.stringContaining('Duplicate'), index: 1 });
  });
});

describe('isSelfOnlyEnvelope', () => {
  it('true only when the single signer matches the owner email, case-insensitively', () => {
    const signers = [{ name: 'Owner', email: 'owner@example.com' }];
    expect(isSelfOnlyEnvelope(signers, 'Owner@Example.com')).toBe(true);
    expect(isSelfOnlyEnvelope(signers, 'someoneelse@example.com')).toBe(false);
  });

  it('false as soon as there is more than one signer, even if the owner is among them', () => {
    const signers = [{ name: 'Owner', email: 'owner@example.com' }, { name: 'Other', email: 'other@example.com' }];
    expect(isSelfOnlyEnvelope(signers, 'owner@example.com')).toBe(false);
  });
});
