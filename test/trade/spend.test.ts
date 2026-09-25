// The $2 position cap. The thing that matters is counting: never let a trade be
// forgotten while the indexer lags, and never count it twice once it catches up.
import { buyLimitError, buyPresets, effectiveSpend, isPositionFull, MAX_POSITION_USDC, MIN_BUY_USDC, remainingAllowance, spendKey } from '@/trade/spend';

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
    expect(remainingAllowance(1_010_000)).toBe(13_990_000);
  });

  it('is zero, not negative, once over the cap', () => {
    expect(remainingAllowance(15_500_000)).toBe(0);
  });

  it('never exceeds the cap after net selling', () => {
    expect(remainingAllowance(-1_000_000)).toBe(MAX_POSITION_USDC);
  });
});

describe('buy limits', () => {
  it('matches the website: $0.50 minimum, $15 per position', () => {
    expect(MIN_BUY_USDC).toBe(500_000);
    expect(MAX_POSITION_USDC).toBe(15_000_000);
  });

  it('counts a position as full once less than a minimum buy is left', () => {
    expect(isPositionFull(499_999)).toBe(true);
    expect(isPositionFull(500_000)).toBe(false);
  });

  it('refuses a buy under the minimum', () => {
    expect(buyLimitError(400_000, MAX_POSITION_USDC, 'YES')).toBe('Minimum buy is $0.50.');
  });

  it('allows the minimum and anything up to the room left', () => {
    expect(buyLimitError(500_000, MAX_POSITION_USDC, 'YES')).toBeNull();
    expect(buyLimitError(15_000_000, MAX_POSITION_USDC, 'YES')).toBeNull();
  });

  it('says how much room is left over the cap', () => {
    expect(buyLimitError(5_000_000, 3_250_000, 'NO')).toBe('Max $15 per position. You can add up to $3.25 more on NO.');
  });

  it('says the position is full when there is no room for a buy', () => {
    expect(buyLimitError(1_000_000, 200_000, 'YES')).toBe('Position full. $15 is the most on YES.');
  });

  it('says nothing about an empty amount', () => {
    expect(buyLimitError(0, MAX_POSITION_USDC, 'YES')).toBeNull();
  });
});

describe('buyPresets', () => {
  const labels = (ps: { label: string }[]) => ps.map((p) => p.label);

  it('offers +$0.5, +$1, +$5 and Max', () => {
    expect(labels(buyPresets(0, MAX_POSITION_USDC, 50_000_000))).toEqual(['+$0.5', '+$1', '+$5', 'Max']);
  });

  it('adds each step to what is typed', () => {
    const ps = buyPresets(1_000_000, MAX_POSITION_USDC, 50_000_000);
    expect(ps.slice(0, 3).map((p) => p.value)).toEqual(['1.50', '2.00', '6.00']);
  });

  it('makes Max the wallet balance when that is the smaller limit', () => {
    expect(buyPresets(0, MAX_POSITION_USDC, 7_345_678).find((p) => p.label === 'Max')?.value).toBe('7.34');
  });

  it('makes Max the room left under the cap when that is smaller', () => {
    expect(buyPresets(0, 3_250_000, 50_000_000).find((p) => p.label === 'Max')?.value).toBe('3.25');
  });

  it('uses the room left for Max while the balance loads', () => {
    expect(buyPresets(0, MAX_POSITION_USDC).find((p) => p.label === 'Max')?.value).toBe('15.00');
  });

  it('never adds past the most that can go in', () => {
    const ps = buyPresets(13_000_000, MAX_POSITION_USDC, 50_000_000);
    expect(ps.find((p) => p.label === '+$5')?.value).toBe('15.00');
  });

  it('leaves Max out when the wallet holds less than a minimum buy', () => {
    expect(labels(buyPresets(0, MAX_POSITION_USDC, 200_000))).toEqual(['+$0.5', '+$1', '+$5']);
  });

  it('offers nothing when the position is full', () => {
    expect(buyPresets(0, 300_000, 50_000_000)).toEqual([]);
  });
});
