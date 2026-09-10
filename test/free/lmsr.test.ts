// Float LMSR for free markets (lib/virtualLmsr.ts on the web). Same shape as
// the on-chain maths but in plain numbers, so the invariants are the same:
// prices pair to one, buying moves the price, and you cannot sell back for
// more than you paid.
import { sharesForTokens, virtualBuyCost, virtualImpliedPrice, virtualSellReturn } from '@/free/lmsr';

import market from '../fixtures/custom-market.json';

const B = Number(market.market.b_parameter);
const word = market.words[0];

describe('virtualImpliedPrice', () => {
  it('pairs YES and NO to one', () => {
    const p = virtualImpliedPrice(word.yes_qty, word.no_qty, B);
    expect(p.yes + p.no).toBeCloseTo(1, 10);
  });

  it('matches the price the route reports', () => {
    for (const w of market.words) {
      expect(virtualImpliedPrice(w.yes_qty, w.no_qty, B).yes).toBeCloseTo(w.yes_price, 6);
    }
  });

  it('is a coin flip on an untouched word', () => {
    expect(virtualImpliedPrice(0, 0, B).yes).toBeCloseTo(0.5, 10);
  });

  it('is a coin flip with no liquidity parameter', () => {
    expect(virtualImpliedPrice(100, 0, 0)).toEqual({ yes: 0.5, no: 0.5 });
  });

  it('rises with YES demand', () => {
    const before = virtualImpliedPrice(word.yes_qty, word.no_qty, B).yes;
    const after = virtualImpliedPrice(word.yes_qty + 500, word.no_qty, B).yes;
    expect(after).toBeGreaterThan(before);
  });
});

describe('virtualBuyCost', () => {
  it('costs nothing for nothing', () => {
    expect(virtualBuyCost(word.yes_qty, word.no_qty, 'YES', 0, B)).toBe(0);
    expect(virtualBuyCost(word.yes_qty, word.no_qty, 'YES', -5, B)).toBe(0);
  });

  it('costs more for more shares', () => {
    const ten = virtualBuyCost(word.yes_qty, word.no_qty, 'YES', 10, B);
    const hundred = virtualBuyCost(word.yes_qty, word.no_qty, 'YES', 100, B);
    expect(hundred).toBeGreaterThan(ten);
  });

  it('never charges more than a token a share', () => {
    // A share pays out one token, so paying over par would be irrational.
    const shares = 250;
    expect(virtualBuyCost(word.yes_qty, word.no_qty, 'YES', shares, B)).toBeLessThan(shares);
  });

  it('charges roughly the current price for a small order', () => {
    const price = virtualImpliedPrice(word.yes_qty, word.no_qty, B).yes;
    const cost = virtualBuyCost(word.yes_qty, word.no_qty, 'YES', 1, B);
    expect(cost).toBeCloseTo(price, 2);
  });
});

describe('virtualSellReturn', () => {
  it('returns less than the buy cost for the same shares', () => {
    const shares = 50;
    const cost = virtualBuyCost(word.yes_qty, word.no_qty, 'YES', shares, B);
    const back = virtualSellReturn(word.yes_qty + shares, word.no_qty, 'YES', shares, B);
    expect(back).toBeLessThanOrEqual(cost + 1e-9);
  });

  it('returns nothing for nothing', () => {
    expect(virtualSellReturn(word.yes_qty, word.no_qty, 'YES', 0, B)).toBe(0);
  });

  it('is never negative', () => {
    expect(virtualSellReturn(10, 10, 'YES', 1000, B)).toBeGreaterThanOrEqual(0);
  });
});

describe('sharesForTokens', () => {
  it('inverts the buy cost', () => {
    for (const budget of [10, 50, 150, 300]) {
      const shares = sharesForTokens(word.yes_qty, word.no_qty, 'YES', budget, B);
      expect(shares).toBeGreaterThan(0);
      expect(virtualBuyCost(word.yes_qty, word.no_qty, 'YES', shares, B)).toBeCloseTo(budget, 4);
    }
  });

  it('buys nothing with nothing', () => {
    expect(sharesForTokens(word.yes_qty, word.no_qty, 'YES', 0, B)).toBe(0);
    expect(sharesForTokens(word.yes_qty, word.no_qty, 'YES', -10, B)).toBe(0);
  });

  it('buys more of the cheaper side', () => {
    const p = virtualImpliedPrice(word.yes_qty, word.no_qty, B);
    const cheap = p.yes < p.no ? 'YES' : 'NO';
    const dear = cheap === 'YES' ? 'NO' : 'YES';
    expect(sharesForTokens(word.yes_qty, word.no_qty, cheap, 100, B)).toBeGreaterThan(
      sharesForTokens(word.yes_qty, word.no_qty, dear, 100, B),
    );
  });
});
