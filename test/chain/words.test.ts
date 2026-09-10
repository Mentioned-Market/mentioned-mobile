// Free majority word rules and pari-mutuel maths (lib/majorityMarket.ts on
// the web). Pure functions, so the tests are the specification.
import {
  betSize,
  coinedWordError,
  computePayouts,
  DEFAULT_BETS_PER_USER,
  DEFAULT_ENDOWMENT,
  DEFAULT_FLOOR_MULTIPLE,
  distributable,
  impliedProb,
  isStopword,
  isValidCoinedWord,
  MAX_BANNED_WORDS,
  normalizeBanList,
  normalizeWord,
  payoutMultiple,
  potentialWin,
} from '@/chain/majorityWords';

describe('normalizeWord', () => {
  it('lowercases, trims and collapses whitespace', () => {
    expect(normalizeWord('  Hello   World ')).toBe('hello world');
    expect(normalizeWord('CREATIVE')).toBe('creative');
  });
});

describe('isStopword', () => {
  it('blocks function words and fillers', () => {
    for (const w of ['the', 'and', 'is', 'gonna', 'um', "it's", 'really']) {
      expect(isStopword(w)).toBe(true);
    }
  });

  it('allows topical content words', () => {
    for (const w of ['border', 'economy', 'haaland', 'iphone', 'creative']) {
      expect(isStopword(w)).toBe(false);
    }
  });

  it('normalizes before checking', () => {
    expect(isStopword('  THE ')).toBe(true);
  });
});

describe('coinedWordError', () => {
  it('accepts names, brands and slang', () => {
    for (const w of ['haaland', 'nvidia', 'goat']) expect(coinedWordError(w)).toBeNull();
    expect(isValidCoinedWord('haaland')).toBe(true);
  });

  it('rejects out-of-range lengths', () => {
    expect(coinedWordError('ab')).toMatch(/at least 3/);
    expect(coinedWordError('abcdefghijklm')).toMatch(/at most 12/);
  });

  it('rejects accents, symbols and mixed alphanumerics', () => {
    expect(coinedWordError('café')).toMatch(/only letters/);
    expect(coinedWordError('word!')).toMatch(/only letters/);
    expect(coinedWordError('a1b2')).toMatch(/only letters/);
  });
});

describe('normalizeBanList', () => {
  it('lowercases, drops blanks and dedupes', () => {
    expect(normalizeBanList(['The', ' the ', '', 'Goal'])).toEqual(['the', 'goal']);
  });

  it('caps the list length', () => {
    const many = Array.from({ length: MAX_BANNED_WORDS + 50 }, (_, i) => `word${i}`);
    expect(normalizeBanList(many)).toHaveLength(MAX_BANNED_WORDS);
  });
});

describe('pari-mutuel maths', () => {
  it('splits the endowment across the required picks', () => {
    expect(betSize(DEFAULT_ENDOWMENT, DEFAULT_BETS_PER_USER)).toBe(150);
    expect(betSize(300, 0)).toBe(0);
  });

  it('reads implied probability as pool share', () => {
    expect(impliedProb(300, 1200)).toBe(0.25);
    expect(impliedProb(0, 1200)).toBe(0);
    expect(impliedProb(300, 0)).toBe(0);
    expect(impliedProb(2000, 1000)).toBe(1);
  });

  it('takes the house cut off the pool', () => {
    expect(distributable(1000, 0)).toBe(1000);
    expect(distributable(1000, 0.1)).toBeCloseTo(900);
    expect(distributable(1000, 2)).toBe(0);
  });

  it('floors the payout multiple for an over-backed favourite', () => {
    // Everyone on one word: natural multiple is 1.0, floored to 1.5.
    expect(payoutMultiple(1000, 1000, 0, DEFAULT_FLOOR_MULTIPLE)).toBe(DEFAULT_FLOOR_MULTIPLE);
    // A long shot beats the floor on its own.
    expect(payoutMultiple(1000, 100, 0, DEFAULT_FLOOR_MULTIPLE)).toBe(10);
  });

  it('pays nothing when the winning word had no backers', () => {
    expect(payoutMultiple(1000, 0, 0, 1.5)).toBe(0);
    expect(computePayouts([], 1000)).toEqual([]);
  });

  it('quotes a fresh pick against the post-pick pool', () => {
    // Entering a word nobody backed in a 1000 pool with a 150 stake.
    const win = potentialWin(0, 1000, 150);
    expect(win).toBeCloseTo(150 * ((1000 + 150) / 150));
  });

  it('quotes a smaller win on a crowded word', () => {
    expect(potentialWin(600, 1000, 150)).toBeLessThan(potentialWin(100, 1000, 150));
  });

  it('pays every winner their share', () => {
    const payouts = computePayouts([{ wallet: 'a', staked: 300 }, { wallet: 'b', staked: 100 }], 1600, 0, 1);
    const total = payouts.reduce((s, p) => s + p.payout, 0);
    expect(total).toBeCloseTo(1600);
    expect(payouts[0].payout).toBeCloseTo(1200);
    expect(payouts[1].payout).toBeCloseTo(400);
  });
});
