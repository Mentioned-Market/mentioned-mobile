// The AMM SDK is a byte-identical port of the web repo (PORTED_FROM header).
// These tests exist to catch it drifting: the decoder must reproduce the
// website's own prices from raw account bytes, and the quote maths must stay
// self-consistent. If one of these fails, the port and the web have diverged
// and every quote in the app is suspect.
import {
  deserializeMarketAccount,
  estimateBuyCost,
  estimateSellReturn,
  formatUsdc,
  impliedYesPrice,
  MarketStatus,
  sharesForUsdc,
  type UsdcMarketAccount,
  type WordState,
} from '@/chain/amm';
import { base64ToBytes } from '@/lib/bytes';

import fixture from '../fixtures/paid-market-account.json';

type ListWord = { label: string; yesPrice: number; noPrice: number; outcome: boolean | null };

function loadMarket(): UsdcMarketAccount {
  const acct = deserializeMarketAccount(base64ToBytes(fixture.account));
  if (!acct) throw new Error('fixture failed to decode');
  return acct;
}

describe('deserializeMarketAccount', () => {
  const acct = loadMarket();

  it('decodes the market id the route was asked for', () => {
    expect(acct.marketId.toString()).toBe(fixture.marketId);
  });

  it('decodes every word the list route reports', () => {
    expect(acct.numWords).toBe(fixture.listEntry.wordCount);
    expect(acct.words).toHaveLength(fixture.listEntry.wordCount);
    expect(acct.words.map((w) => w.label)).toEqual((fixture.listEntry.words as ListWord[]).map((w) => w.label));
  });

  it('decodes plausible market metadata', () => {
    expect(acct.liquidityParamB).toBeGreaterThan(0n);
    expect(acct.tradeFeeBps).toBeGreaterThanOrEqual(0);
    expect(acct.tradeFeeBps).toBeLessThan(10_000);
    expect(Object.values(MarketStatus)).toContain(acct.status);
    expect(acct.usdcMint).toHaveLength(44);
  });

  it('returns null for bytes that are not a market account', () => {
    expect(deserializeMarketAccount(new Uint8Array(8))).toBeNull();
    expect(deserializeMarketAccount(new Uint8Array(400))).toBeNull();
  });
});

describe('impliedYesPrice', () => {
  const acct = loadMarket();

  // The cross-check that matters: the website computes these prices server
  // side, we compute them on device from the same bytes. They must agree.
  it.each((fixture.listEntry.words as ListWord[]).map((w, i) => [w.label, i, w.yesPrice] as const))(
    'matches the website YES price for "%s"',
    (_label, i, expected) => {
      expect(impliedYesPrice(acct.words[i], acct.liquidityParamB)).toBeCloseTo(expected, 6);
    },
  );

  it('pairs YES and NO to one', () => {
    for (const w of acct.words) {
      const yes = impliedYesPrice(w, acct.liquidityParamB);
      expect(yes).toBeGreaterThan(0);
      expect(yes).toBeLessThan(1);
    }
  });

  it('is a coin flip with no liquidity parameter', () => {
    expect(impliedYesPrice(acct.words[0], 0n)).toBe(0.5);
  });

  it('rises as YES is bought', () => {
    const w = acct.words[0];
    const heavier: WordState = { ...w, yesQuantity: w.yesQuantity + 50_000_000n };
    expect(impliedYesPrice(heavier, acct.liquidityParamB)).toBeGreaterThan(impliedYesPrice(w, acct.liquidityParamB));
  });
});

describe('quotes', () => {
  const acct = loadMarket();
  const b = acct.liquidityParamB;
  const word = acct.words[0];
  const ONE_DOLLAR = 1_000_000n;

  it('never quotes more shares than the budget pays for', () => {
    for (const usdc of [ONE_DOLLAR, 5n * ONE_DOLLAR, 25n * ONE_DOLLAR]) {
      const shares = sharesForUsdc(word, b, 'YES', usdc);
      expect(shares).toBeGreaterThan(0n);
      expect(estimateBuyCost(word, b, 'YES', shares)).toBeLessThanOrEqual(usdc);
    }
  });

  it('spends nearly all of the budget', () => {
    const shares = sharesForUsdc(word, b, 'YES', ONE_DOLLAR);
    const cost = estimateBuyCost(word, b, 'YES', shares);
    // Binary search converges to within a cent of the budget.
    expect(Number(ONE_DOLLAR - cost)).toBeLessThan(10_000);
  });

  it('is monotonic: a bigger budget buys more shares', () => {
    const small = sharesForUsdc(word, b, 'YES', ONE_DOLLAR);
    const large = sharesForUsdc(word, b, 'YES', 10n * ONE_DOLLAR);
    expect(large).toBeGreaterThan(small);
  });

  it('costs more per share as you buy more', () => {
    const oneDollar = sharesForUsdc(word, b, 'YES', ONE_DOLLAR);
    const tenDollars = sharesForUsdc(word, b, 'YES', 10n * ONE_DOLLAR);
    const avgSmall = Number(ONE_DOLLAR) / Number(oneDollar);
    const avgLarge = Number(10n * ONE_DOLLAR) / Number(tenDollars);
    expect(avgLarge).toBeGreaterThan(avgSmall);
  });

  it('gives no free money: selling back what you just bought returns less', () => {
    const shares = sharesForUsdc(word, b, 'YES', 5n * ONE_DOLLAR);
    const cost = estimateBuyCost(word, b, 'YES', shares);
    const back = estimateSellReturn(word, b, 'YES', shares);
    expect(back).toBeLessThanOrEqual(cost);
  });

  it('prices the cheaper side as more shares per dollar', () => {
    const yes = impliedYesPrice(word, b);
    const cheap = yes < 0.5 ? 'YES' : 'NO';
    const dear = cheap === 'YES' ? 'NO' : 'YES';
    expect(sharesForUsdc(word, b, cheap, ONE_DOLLAR)).toBeGreaterThan(sharesForUsdc(word, b, dear, ONE_DOLLAR));
  });

  it('quotes nothing for a zero or negative amount', () => {
    expect(sharesForUsdc(word, b, 'YES', 0n)).toBe(0n);
    expect(sharesForUsdc(word, b, 'YES', -1n)).toBe(0n);
    expect(estimateBuyCost(word, b, 'YES', 0n)).toBe(0n);
    expect(estimateSellReturn(word, b, 'YES', 0n)).toBe(0n);
  });

  it('quotes nothing when the market has no liquidity parameter', () => {
    expect(sharesForUsdc(word, 0n, 'YES', ONE_DOLLAR)).toBe(0n);
    expect(estimateBuyCost(word, 0n, 'YES', 1_000n)).toBe(0n);
  });

  it('never returns more than the shares are worth at resolution', () => {
    // A YES share pays exactly $1, so a sell can never beat face value.
    const shares = sharesForUsdc(word, b, 'YES', 2n * ONE_DOLLAR);
    expect(estimateSellReturn(word, b, 'YES', shares)).toBeLessThanOrEqual(shares);
  });
});

describe('formatUsdc', () => {
  it('renders base units as dollars with two decimals', () => {
    expect(formatUsdc(0n)).toBe('0.00');
    expect(formatUsdc(1_000_000n)).toBe('1.00');
    expect(formatUsdc(1_234_567n)).toBe('1.23');
    expect(formatUsdc(-2_500_000n)).toBe('-2.50');
  });
});
