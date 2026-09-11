// Position rows drive the Positions tab and the Home summary, including which
// call to action each finished row gets once trading lands.
import { fromFree, fromPaidMajority, fromPaidYesNo, groupByMarket, groupPositions, type PositionRow } from '@/markets/positions';

import activity from '../fixtures/custom-user-activity.json';
import majPositions from '../fixtures/paid-majority-user-positions.json';
import ammPositions from '../fixtures/paid-markets-user-positions.json';

describe('paid majority rows', () => {
  it('maps every fixture row without throwing', () => {
    const rows = majPositions.positions.map((p) => fromPaidMajority(p as never));
    expect(rows).toHaveLength(majPositions.positions.length);
    for (const r of rows) expect(r.kind).toBe('paid-majority');
  });

  it('offers a claim when there is something to claim', () => {
    const row = fromPaidMajority({ marketId: '1', title: 'T', slug: 's', status: 1, word: 'goal', wordHash: 'h', units: '2', stakeUsdc: 2, claimableUsdc: 5.5, refundable: false } as never);
    expect(row.finished).toBe(true);
    expect(row.won).toBe(true);
    expect(row.cta?.label).toContain('Claim');
    expect(row.claimableUsd).toBe(5.5);
    expect(row.href).toBe('/result/majority/1');
  });

  it('shows a refund amount but never a refund button', () => {
    // Refunds on majority markets are settled from the website's admin tab, so
    // the app states the amount and offers nothing to tap (SPEC 7.1).
    const row = fromPaidMajority({ marketId: '1', title: 'T', slug: 's', status: 2, word: 'goal', wordHash: 'h', units: '1', stakeUsdc: 1, claimableUsdc: 0, refundable: true } as never);
    expect(row.cta).toBeNull();
    expect(row.value).toBe('$1.00 refund');
    expect(row.finished).toBe(true);
  });

  it('sends an open position to the market, not the result', () => {
    const row = fromPaidMajority({ marketId: '9', title: 'T', slug: 's', status: 0, word: 'goal', wordHash: 'h', units: '1', stakeUsdc: 1, claimableUsdc: 0, refundable: false } as never);
    expect(row.finished).toBe(false);
    expect(row.cta).toBeNull();
    expect(row.href).toBe('/majority/9');
    expect(row.stakeUsd).toBe(1);
  });
});

describe('paid YES/NO rows', () => {
  it('says the cost is updating before the indexer records it, rather than $0.00', () => {
    // Shares come from the chain at once; the cost basis comes from the trade
    // indexer, which trails it. A fresh position must not claim it cost nothing.
    const row = fromPaidYesNo({ marketId: '1', marketTitle: 'T', marketStatus: 0, coverImageUrl: null, wordIndex: 0, wordLabel: 'w', yesShares: '1909059', noShares: '0', yesPrice: 0.55, noPrice: 0.45, outcome: null, estValueUsdc: '1000000', costBasisUsdc: '0' } as never);
    expect(row.value).toBe('Worth $1.00 (cost updating)');
    // Counted at its current value in "At stake" until then, not as zero.
    expect(row.stakeUsd).toBe(1);
  });

  it('uses the recorded cost once the indexer has it', () => {
    const row = fromPaidYesNo({ marketId: '1', marketTitle: 'T', marketStatus: 0, coverImageUrl: null, wordIndex: 0, wordLabel: 'w', yesShares: '1909059', noShares: '0', yesPrice: 0.55, noPrice: 0.45, outcome: null, estValueUsdc: '1000000', costBasisUsdc: '1010000' } as never);
    expect(row.value).toBe('Worth $1.00 (cost $1.01)');
    expect(row.stakeUsd).toBe(1.01);
  });

  it('maps every fixture row', () => {
    const rows = ammPositions.positions.map((p) => fromPaidYesNo(p as never));
    for (const r of rows) expect(r.kind).toBe('paid-yesno');
  });

  it('reads the held side from the larger balance', () => {
    const row = fromPaidYesNo({ marketId: '1', marketTitle: 'T', marketStatus: 0, coverImageUrl: null, wordIndex: 0, wordLabel: 'w', yesShares: '0', noShares: '2000000', yesPrice: 0.4, noPrice: 0.6, outcome: null, estValueUsdc: '1200000', costBasisUsdc: '1000000' } as never);
    expect(row.line).toContain('NO');
  });

  it('offers a redeem on a winning resolved word', () => {
    const row = fromPaidYesNo({ marketId: '1', marketTitle: 'T', marketStatus: 2, coverImageUrl: null, wordIndex: 0, wordLabel: 'w', yesShares: '3000000', noShares: '0', yesPrice: 1, noPrice: 0, outcome: true, estValueUsdc: '3000000', costBasisUsdc: '1000000' } as never);
    expect(row.won).toBe(true);
    expect(row.cta?.label).toContain('Redeem');
    expect(row.claimableUsd).toBe(3);
  });

  it('offers rent back on a losing resolved word', () => {
    const row = fromPaidYesNo({ marketId: '1', marketTitle: 'T', marketStatus: 2, coverImageUrl: null, wordIndex: 0, wordLabel: 'w', yesShares: '3000000', noShares: '0', yesPrice: 0, noPrice: 1, outcome: false, estValueUsdc: '0', costBasisUsdc: '1000000' } as never);
    expect(row.won).toBe(false);
    expect(row.cta?.label).toBe('Reclaim rent');
    expect(row.claimableUsd).toBeUndefined();
  });
});

describe('free rows', () => {
  const rows = fromFree(activity as never);

  it('maps every activity position', () => {
    expect(rows).toHaveLength(activity.positions.length);
  });

  it('routes majority entries to the board', () => {
    for (const [i, p] of activity.positions.entries()) {
      const expected = p.market_type === 'majority' ? 'free-majority' : 'free-yesno';
      expect(rows[i].kind).toBe(expected);
    }
  });

  it('counts an open position toward tokens at stake', () => {
    const open = rows.find((r) => !r.finished);
    if (open) expect(open.tokensIn).toBeGreaterThan(0);
  });
});

describe('groupPositions', () => {
  const base: PositionRow = { key: 'k', marketKey: 'pm:1', kind: 'paid-majority', cover: null, href: '/x', title: 'T', line: '', value: '', finished: false, won: null, cta: null };

  it('splits open from finished', () => {
    const { open, finished } = groupPositions([base, { ...base, key: '2', finished: true }]);
    expect(open).toHaveLength(1);
    expect(finished).toHaveLength(1);
  });

  it('puts claimable rows before wins and losses', () => {
    const loss = { ...base, key: 'loss', finished: true, won: false, cta: { label: 'Reclaim rent', tone: 'neutral' as const } };
    const win = { ...base, key: 'win', finished: true, won: true, cta: { label: 'View result', tone: 'neutral' as const } };
    const claim = { ...base, key: 'claim', finished: true, won: true, cta: { label: 'Claim $2', tone: 'yes' as const } };
    expect(groupPositions([loss, win, claim]).finished.map((r) => r.key)).toEqual(['claim', 'win', 'loss']);
  });

  it('sums the summary across kinds', () => {
    const { summary } = groupPositions([
      { ...base, key: 'a', stakeUsd: 3 },
      { ...base, key: 'b', tokensIn: 150 },
      { ...base, key: 'c', finished: true, claimableUsd: 1.5, cta: { label: 'Claim', tone: 'yes' } },
    ]);
    expect(summary.open).toBe(2);
    expect(summary.finished).toBe(1);
    expect(summary.actionable).toBe(1);
    expect(summary.stakedUsd).toBe(3);
    expect(summary.tokensIn).toBe(150);
    expect(summary.claimableUsd).toBe(1.5);
  });

  it('summarises an empty list as zeroes', () => {
    const { summary } = groupPositions([]);
    expect(summary).toEqual({ open: 0, finished: 0, actionable: 0, stakedUsd: 0, tokensIn: 0, claimableUsd: 0 });
  });
});

describe('groupByMarket', () => {
  const base: PositionRow = { key: 'k', marketKey: 'pm:1', kind: 'paid-majority', cover: null, href: '/majority/1', title: 'Market 1', line: '', value: '', finished: false, won: null, cta: null };

  it('folds every position in a market into one group, in first-seen order', () => {
    const groups = groupByMarket([
      { ...base, key: 'a', stakeUsd: 1 },
      { ...base, key: 'b', marketKey: 'pm:2', title: 'Market 2' },
      { ...base, key: 'c', stakeUsd: 2 },
    ]);
    expect(groups.map((g) => g.key)).toEqual(['pm:1', 'pm:2']);
    expect(groups[0].rows.map((r) => r.key)).toEqual(['a', 'c']);
    expect(groups[0].count).toBe('2 positions');
    expect(groups[0].value).toBe('$3.00 at stake');
    expect(groups[1].count).toBe('1 position');
  });

  it('totals tokens for an open free market', () => {
    const free = { ...base, marketKey: 'fr:3', kind: 'free-majority' as const };
    const [g] = groupByMarket([
      { ...free, key: 'a', tokensIn: 150 },
      { ...free, key: 'b', tokensIn: 150 },
    ]);
    expect(g.value).toBe('300 tokens in');
  });

  it('leads a finished market with what there is to claim', () => {
    const done = { ...base, finished: true };
    const [g] = groupByMarket([
      { ...done, key: 'a', won: true, claimableUsd: 1.91 },
      { ...done, key: 'b', won: false },
    ]);
    expect(g.value).toBe('$1.91 to claim');
    expect(g.won).toBe(true);
  });

  it('calls a market lost only when every position lost', () => {
    const done = { ...base, finished: true };
    expect(groupByMarket([{ ...done, key: 'a', won: false }, { ...done, key: 'b', won: false }])[0]).toMatchObject({ won: false, value: 'Lost' });
    expect(groupByMarket([{ ...done, key: 'a', won: false }, { ...done, key: 'b', won: null }])[0].won).toBeNull();
  });

  it('says what a finished free market paid back', () => {
    const free = { ...base, marketKey: 'fr:3', kind: 'free-yesno' as const, finished: true };
    expect(groupByMarket([{ ...free, key: 'a', tokensOut: 95 }])[0].value).toBe('Returned 95 tokens');
    expect(groupByMarket([{ ...free, key: 'a', tokensOut: 0 }])[0].value).toBe('No return');
  });

  it('keeps the cover from whichever position has one', () => {
    const [g] = groupByMarket([{ ...base, key: 'a' }, { ...base, key: 'b', cover: 'https://x/c.png' }]);
    expect(g.cover).toBe('https://x/c.png');
  });
});
