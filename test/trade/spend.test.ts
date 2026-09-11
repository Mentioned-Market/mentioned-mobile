// The $2 position cap. The thing that matters is counting: never let a trade be
// forgotten while the indexer lags, and never count it twice once it catches up.
import { effectiveSpend, MAX_POSITION_USDC, remainingAllowance, spendKey } from '@/trade/spend';

describe('spendKey', () => {
  it('matches the route: 0 for YES, 1 for NO', () => {
    expect(spendKey(3, 'YES')).toBe('3:0');
    expect(spendKey(3, 'NO')).toBe('3:1');
  });
});

describe('effectiveSpend', () => {
  it('uses the server figure when this session has not traded the position', () => {
    expect(effectiveSpend(750_000, undefined)).toBe(750_000);
    expect(effectiveSpend(undefined, undefined)).toBe(0);
  });

  it('counts a fresh trade the indexer has not seen yet', () => {
    // Server still says 0; this session spent $1.01.
    expect(effectiveSpend(0, { baseline: 0, session: 1_010_000 })).toBe(1_010_000);
  });

  it('does not double count once the indexer catches up', () => {
    // The server now includes the $1.01, and the session also remembers it.
    expect(effectiveSpend(1_010_000, { baseline: 0, session: 1_010_000 })).toBe(1_010_000);
  });

  it('adds new trades on top of history the server already knew about', () => {
    // $0.50 of earlier history, then $1.01 this session not yet indexed.
    expect(effectiveSpend(500_000, { baseline: 500_000, session: 1_010_000 })).toBe(1_510_000);
  });

  it('lets a sell reopen room under the cap', () => {
    expect(effectiveSpend(0, { baseline: 0, session: 1_010_000 - 990_000 })).toBe(20_000);
  });
});

describe('remainingAllowance', () => {
  it('is the whole cap for an untouched position', () => {
    expect(remainingAllowance(0)).toBe(MAX_POSITION_USDC);
  });

  it('shrinks with spend', () => {
    expect(remainingAllowance(1_010_000)).toBe(990_000);
  });

  it('is zero, not negative, once over the cap', () => {
    expect(remainingAllowance(2_500_000)).toBe(0);
  });

  it('never exceeds the cap after net selling', () => {
    expect(remainingAllowance(-1_000_000)).toBe(MAX_POSITION_USDC);
  });
});
