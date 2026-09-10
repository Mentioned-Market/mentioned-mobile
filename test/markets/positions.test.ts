// Position rows drive the Positions tab and the Home summary, including which
// call to action each finished row gets once trading lands.
import { fromFree, fromPaidMajority, fromPaidYesNo, groupPositions, type PositionRow } from '@/markets/positions';

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

  it('offers a refund on a cancelled market', () => {
    const row = fromPaidMajority({ marketId: '1', title: 'T', slug: 's', status: 2, word: 'goal', wordHash: 'h', units: '1', stakeUsdc: 1, claimableUsdc: 0, refundable: true } as never);
    expect(row.cta?.label).toBe('Refund');
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
  const base: PositionRow = { key: 'k', kind: 'paid-majority', cover: null, href: '/x', title: 'T', line: '', value: '', finished: false, won: null, cta: null };

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
