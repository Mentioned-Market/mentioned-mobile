// The ported confirmation rules. The file is the website's, byte for byte, so
// these pin what the app relies on: which sheet is due, when Confirm unlocks,
// and that the copy obeys this repo's writing rules before it reaches a screen.
import {
  ARENA_EXISTING_MEMBER_COPY,
  ATTESTATION_COPY,
  canConfirm,
  decideTradeVariant,
  isValidMarketId,
  variantSatisfies,
} from '@/lib/attestation';

describe('decideTradeVariant', () => {
  it('asks for the full checklist on a first trade', () => {
    expect(decideTradeVariant(false, false)).toBe('full');
  });

  it('asks for the quick check on a new market once the full one is done', () => {
    expect(decideTradeVariant(true, false)).toBe('compact');
  });

  it('asks for nothing on a market already confirmed', () => {
    expect(decideTradeVariant(true, true)).toBeNull();
    expect(decideTradeVariant(false, true)).toBeNull();
  });
});

describe('variantSatisfies', () => {
  it('lets the stricter sheet stand in for the lighter one, never the reverse', () => {
    expect(variantSatisfies('full', 'full')).toBe(true);
    expect(variantSatisfies('compact', 'compact')).toBe(true);
    expect(variantSatisfies('full', 'compact')).toBe(true);
    expect(variantSatisfies('compact', 'full')).toBe(false);
  });
});

describe('canConfirm', () => {
  it('needs every box ticked', () => {
    expect(canConfirm([false, false, false], 'full')).toBe(false);
    expect(canConfirm([true, true, false], 'full')).toBe(false);
    expect(canConfirm([true, true, true], 'full')).toBe(true);
    expect(canConfirm([true], 'compact')).toBe(true);
    expect(canConfirm([true, true], 'arena')).toBe(true);
  });

  it('refuses a tick list of the wrong length', () => {
    expect(canConfirm([true], 'full')).toBe(false);
    expect(canConfirm([], 'compact')).toBe(false);
  });
});

describe('isValidMarketId', () => {
  it('accepts a u64 and nothing else', () => {
    expect(isValidMarketId('0')).toBe(true);
    expect(isValidMarketId('18446744073709551615')).toBe(true);
    expect(isValidMarketId('18446744073709551616')).toBe(false);
    expect(isValidMarketId('-1')).toBe(false);
    expect(isValidMarketId('1.5')).toBe(false);
    expect(isValidMarketId('abc')).toBe(false);
    expect(isValidMarketId(12)).toBe(false);
  });
});

describe('the copy', () => {
  const all = [...Object.values(ATTESTATION_COPY), ARENA_EXISTING_MEMBER_COPY];
  const strings = all.flatMap((c) => [c.title, c.intro, ...c.checkboxes, c.footer ?? '', c.cancelLabel, c.confirmLabel]);

  it('has no em dashes and never says bet', () => {
    for (const s of strings) {
      expect(s).not.toMatch(/[—–]/);
      expect(s).not.toMatch(/\bbet(s|ting)?\b/i);
    }
  });

  it('reframes the Arena sheet for existing members without changing what they agree to', () => {
    expect(ARENA_EXISTING_MEMBER_COPY.checkboxes).toBe(ATTESTATION_COPY.arena.checkboxes);
    expect(ARENA_EXISTING_MEMBER_COPY.confirmLabel).not.toMatch(/join/i);
  });
});
