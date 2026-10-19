import {
  OTP_LENGTH,
  generateAccessToken,
  generateOtpCode,
  hashSecret,
  secretMatches,
} from '../../src/services/otp.service';

describe('generateOtpCode', () => {
  it(`generates a zero-padded ${OTP_LENGTH}-digit numeric code`, () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(new RegExp(`^\\d{${OTP_LENGTH}}$`));
    }
  });
});

describe('generateAccessToken', () => {
  it('generates long, unpredictable, unique hex tokens', () => {
    const tokens = new Set(Array.from({ length: 20 }, generateAccessToken));
    expect(tokens.size).toBe(20);
    for (const t of tokens) expect(t).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('hashSecret / secretMatches', () => {
  it('is deterministic and never stores the raw value', () => {
    const hash = hashSecret('123456');
    expect(hash).not.toBe('123456');
    expect(hashSecret('123456')).toBe(hash);
  });

  it('matches the correct secret and rejects a wrong one', () => {
    const hash = hashSecret('654321');
    expect(secretMatches('654321', hash)).toBe(true);
    expect(secretMatches('000000', hash)).toBe(false);
  });

  it('rejects against a missing hash instead of throwing', () => {
    expect(secretMatches('123456', undefined)).toBe(false);
    expect(secretMatches('123456', null)).toBe(false);
  });
});
