// "Your picks" on Home joins open positions to the market list for the lock
// time and cover, and ranks by what closes next.
import { homePicks, marketKeyOf } from '@/markets/home-picks';
import type { MarketSummary } from '@/markets/merge';
import { fromPaidMajority, groupByMarket, type MarketGroup } from '@/markets/positions';

const NOW = Date.parse('2026-09-26T12:00:00Z');
const HOUR = 3_600_000;

const market = (over: Partial<MarketSummary>): MarketSummary => ({
  kind: 'paid-majority',
  id: '1',
  href: '/majority/1',
  title: 'Market',
  cover: null,
  status: 'open',
  lockAt: null,
  eventAt: null,
  words: [],
  pool: { kind: 'usdc', usd: 0 },
  traderCount: 0,
  isFeatured: false,
  category: null,
  ...over,
});

const group = (over: Partial<MarketGroup>): MarketGroup => ({
  key: 'pm:1',
  kind: 'paid-majority',
  cover: null,
  href: '/majority/1',
  title: 'Market',
  finished: false,
  won: null,
  rows: [],
  count: '1 position',
  value: '$1.00 at stake',
  ...over,
});

describe('marketKeyOf', () => {
  // The join only works if this matches the keys positions.ts builds.
  it('matches the key a position group is given', () => {
    const [g] = groupByMarket([
      fromPaidMajority({ marketId: '77', title: 'T', slug: 's', status: 0, word: 'goal', wordHash: 'h', units: '1', stakeUsdc: 1, claimableUsdc: 0, refundable: false } as never),
    ]);
    expect(marketKeyOf({ kind: 'paid-majority', id: '77' })).toBe(g.key);
  });

  it('uses one prefix for both free kinds', () => {
    expect(marketKeyOf({ kind: 'free-yesno', id: '5' })).toBe('fr:5');
    expect(marketKeyOf({ kind: 'free-majority', id: '5' })).toBe('fr:5');
    expect(marketKeyOf({ kind: 'paid-yesno', id: '5' })).toBe('pa:5');
  });
});

describe('homePicks', () => {
  it('ranks by what closes next and says how long is left', () => {
    const { picks } = homePicks(
      [group({ key: 'pm:late', title: 'Late' }), group({ key: 'pm:soon', title: 'Soon' })],
      [market({ id: 'late', lockAt: NOW + 5 * HOUR }), market({ id: 'soon', lockAt: NOW + HOUR })],
      NOW,
    );
    expect(picks.map((p) => p.title)).toEqual(['Soon', 'Late']);
    expect(picks[0].when).toBe('Closes 1h 0m');
    expect(picks[0].closing).toBe(true);
  });

  it('says a locked market is awaiting its result', () => {
    const { picks } = homePicks([group({ key: 'pm:1' })], [market({ id: '1', lockAt: NOW - HOUR })], NOW);
    expect(picks[0].when).toBe('Awaiting result');
    expect(picks[0].closing).toBe(false);
  });

  it('keeps a position whose market is not in the list, after the dated ones', () => {
    const { picks } = homePicks([group({ key: 'pm:gone', title: 'Gone' }), group({ key: 'pm:1', title: 'Listed' })], [market({ id: '1', lockAt: NOW + HOUR })], NOW);
    expect(picks.map((p) => p.title)).toEqual(['Listed', 'Gone']);
    expect(picks[1].when).toBeNull();
  });

  it('takes the cover from the market when the position has none', () => {
    const { picks } = homePicks([group({ key: 'pm:1' })], [market({ id: '1', cover: 'https://x/c.png' })], NOW);
    expect(picks[0].cover).toBe('https://x/c.png');
  });

  it('shows at most the limit, and counts the rest', () => {
    const open = ['a', 'b', 'c', 'd', 'e'].map((id) => group({ key: `pm:${id}` }));
    const { picks, total } = homePicks(open, [], NOW, 3);
    expect(picks).toHaveLength(3);
    expect(total).toBe(5);
  });

  it('leaves out finished markets', () => {
    const { picks, total } = homePicks([group({ finished: true })], [], NOW);
    expect(picks).toHaveLength(0);
    expect(total).toBe(0);
  });
});
