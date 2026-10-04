// The leaderboard of a resolved paid YES/NO market. The server scores it; these
// pin how the app words a row, and that rounding never reads as a win or a loss.
import { PaidMarketResults } from '@/api/results';
import { RESULTS_SHOWN, foldedRows, pnlTone, resultsSummary, returnPct, signedUsd, traderLine } from '@/markets/paid-results';

import fixture from '../fixtures/paid-market-results.json';

describe('signedUsd', () => {
  it('signs a profit and a loss', () => {
    expect(signedUsd(7.129487)).toBe('+$7.13');
    expect(signedUsd(-1)).toBe('-$1.00');
  });

  it('keeps cents on a large sum, where two rows may differ by them', () => {
    expect(signedUsd(1234.5)).toBe('+$1,234.50');
  });

  it('shows rounding as flat, never as a green or red zero', () => {
    expect(signedUsd(0.003)).toBe('$0.00');
    expect(signedUsd(-0.003)).toBe('$0.00');
    expect(pnlTone(0.003)).toBe('flat');
    expect(pnlTone(-0.003)).toBe('flat');
    expect(pnlTone(0.01)).toBe('up');
    expect(pnlTone(-0.01)).toBe('down');
  });
});

describe('returnPct', () => {
  it('is the profit over what went in', () => {
    expect(returnPct(7.129487, 7.74999)).toBe('+92.0%');
    expect(returnPct(-1, 1)).toBe('-100%');
    expect(returnPct(25, 10)).toBe('+250%');
    expect(returnPct(0, 5)).toBe('0%');
  });

  it('is absent when nothing was put in', () => {
    expect(returnPct(2, 0)).toBeNull();
    expect(returnPct(2, -1.5)).toBeNull();
  });
});

describe('traderLine', () => {
  it('says how many words, how much went in, and the points', () => {
    expect(traderLine({ words: [1, 2, 3], stakeUsdc: 7.74999, points: 500 })).toBe('3 words · $7.75 in · 500 pts');
    expect(traderLine({ words: [1], stakeUsdc: 1, points: 0 })).toBe('1 word · $1.00 in');
  });

  it('never shows a negative amount put in', () => {
    expect(traderLine({ words: [1], stakeUsdc: -0.5, points: 0 })).toBe('1 word · $0.00 in');
  });
});

describe('resultsSummary', () => {
  it('counts who finished in profit', () => {
    expect(resultsSummary([{ profitUsdc: 3 }, { profitUsdc: 0.001 }, { profitUsdc: -1 }])).toBe('1 in profit · 3 traders');
    expect(resultsSummary([{ profitUsdc: 3 }])).toBe('1 in profit · 1 trader');
  });
});

describe('foldedRows', () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({ wallet: `w${i + 1}` }));

  it('shows the first ten', () => {
    const shown = foldedRows(rows, null, false);
    expect(shown).toHaveLength(RESULTS_SHOWN);
    expect(shown[9]).toEqual({ row: { wallet: 'w10' }, rank: 10 });
  });

  it('adds the viewer below them, with their real rank', () => {
    const shown = foldedRows(rows, 'w18', false);
    expect(shown).toHaveLength(RESULTS_SHOWN + 1);
    expect(shown[10]).toEqual({ row: { wallet: 'w18' }, rank: 18 });
  });

  it('does not repeat a viewer already in the first ten', () => {
    expect(foldedRows(rows, 'w3', false)).toHaveLength(RESULTS_SHOWN);
  });

  it('shows everyone once unfolded, or when there is nothing to fold', () => {
    expect(foldedRows(rows, 'w18', true)).toHaveLength(25);
    expect(foldedRows(rows.slice(0, 4), null, false)).toHaveLength(4);
  });
});

describe('the captured route', () => {
  const parsed = PaidMarketResults.parse(fixture);

  it('parses, resolved, with a word breakdown on every row', () => {
    expect(parsed.resolved).toBe(true);
    expect(parsed.leaderboard.length).toBeGreaterThan(0);
    for (const r of parsed.leaderboard) for (const w of r.words) expect(['YES', 'NO']).toContain(w.side);
  });

  it('arrives sorted by profit, which is the order the app draws', () => {
    const profits = parsed.leaderboard.map((r) => r.profitUsdc);
    expect(profits).toEqual([...profits].sort((a, b) => b - a));
  });
});
