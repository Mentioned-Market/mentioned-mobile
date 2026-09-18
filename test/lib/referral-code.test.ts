import { cleanReferralCode } from '@/lib/referral-code';

describe('cleanReferralCode', () => {
  it('keeps a plain code, trimmed', () => {
    expect(cleanReferralCode(' taylor_1 ')).toBe('taylor_1');
    expect(cleanReferralCode('AB-cd')).toBe('AB-cd');
  });
  it('drops anything that is not a code', () => {
    expect(cleanReferralCode('')).toBeNull();
    expect(cleanReferralCode(undefined)).toBeNull();
    expect(cleanReferralCode('ab')).toBeNull();
    expect(cleanReferralCode('has space')).toBeNull();
    expect(cleanReferralCode('<script>')).toBeNull();
    expect(cleanReferralCode('x'.repeat(33))).toBeNull();
  });
});
