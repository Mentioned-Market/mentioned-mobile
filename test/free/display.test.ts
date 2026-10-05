// A free YES/NO market reads its odds the way a paid one does. These pin that
// the two agree on the same price, and that a multiplier never over-promises.
import { freeBuyMultiplier, freeQuote } from '@/free/display';
import { sideQuote } from '@/trade/amm-display';

describe('freeQuote', () => {
  it('is one over the price of the side', () => {
    expect(freeQuote(0.5, 'YES')).toBe('2x');
    expect(freeQuote(0.4, 'YES')).toBe('2.50x');
    expect(freeQuote(0.4, 'NO')).toBe('1.66x');
  });

  it('matches a paid market with no fee and no rake, price for price', () => {
    for (const p of [0.05, 0.2, 0.46, 0.5, 0.79, 0.95]) {
      expect(freeQuote(p, 'YES')).toBe(sideQuote(p, 'YES', { feeBps: 0, rakeBps: 0 }));
      expect(freeQuote(p, 'NO')).toBe(sideQuote(p, 'NO', { feeBps: 0, rakeBps: 0 }));
    }
  });

  it('rounds down, so it never promises more than it pays', () => {
    // 1 / 0.46 = 2.1739...
    expect(freeQuote(0.46, 'YES')).toBe('2.17x');
  });

  it('caps a near-certain loser instead of teasing a huge number', () => {
    expect(freeQuote(0.001, 'YES')).toBe('100x+');
  });

  it('has no quote once the word has resolved', () => {
    expect(freeQuote(0.7, 'YES', true)).toBe('');
    expect(freeQuote(0.7, 'NO', false)).toBe('');
  });
});

describe('freeBuyMultiplier', () => {
  it('is what the buy pays over what it cost', () => {
    expect(freeBuyMultiplier(100, 50)).toBe('2x');
    expect(freeBuyMultiplier(108.6, 50)).toBe('2.17x');
  });

  it('is empty when there is nothing to quote', () => {
    expect(freeBuyMultiplier(0, 0)).toBe('');
    expect(freeBuyMultiplier(10, 0)).toBe('');
  });
});
