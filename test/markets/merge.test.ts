// Merging three list routes into one ordered feed. This is what decides what
// a user sees first on the Markets tab, so the ordering rules are pinned.
import {
  filterMarkets,
  fromFree,
  fromPaidMajority,
  fromPaidYesNo,
  isHero,
  isMajority,
  isPaid,
  mergeMarkets,
  sectionMarkets,
  sortMarkets,
  type MarketSummary,
} from '@/markets/merge';

import freeList from '../fixtures/custom-list.json';
import majList from '../fixtures/paid-majority-list.json';
import ammList from '../fixtures/paid-markets-list.json';

const NOW = Date.parse('2026-09-10T12:00:00Z');

function fake(over: Partial<MarketSummary>): MarketSummary {
  return {
    kind: 'paid-yesno',
    id: '1',
    href: '/paid/1',
    title: 'Market',
    cover: null,
    status: 'open',
    lockAt: NOW + 3_600_000,
    eventAt: null,
    words: [],
    pool: { kind: 'usdc', usd: 0 },
    traderCount: 0,
    isFeatured: false,
    ...over,
  };
}

describe('adapters', () => {
  it('maps a paid majority market', () => {
    const m = fromPaidMajority(majList.markets[0] as never, NOW);
    expect(m.kind).toBe('paid-majority');
    expect(m.href).toBe(`/majority/${majList.markets[0].marketId}`);
    expect(m.pool.kind).toBe('usdc');
    expect(m.words.length).toBeLessThanOrEqual(5);
    expect(isPaid(m)).toBe(true);
    expect(isMajority(m)).toBe(true);
  });

  it('maps a paid YES/NO market', () => {
    const m = fromPaidYesNo(ammList.markets[0] as never, NOW);
    expect(m.kind).toBe('paid-yesno');
    expect(m.href).toBe(`/paid/${ammList.markets[0].marketId}`);
    expect(isMajority(m)).toBe(false);
    // Word percentages are YES prices, so they are probabilities.
    for (const w of m.words) {
      expect(w.pct).toBeGreaterThanOrEqual(0);
      expect(w.pct).toBeLessThanOrEqual(1);
    }
  });

  it('routes free markets by type', () => {
    for (const entry of freeList.markets) {
      const m = fromFree(entry as never);
      expect(isPaid(m)).toBe(false);
      expect(m.pool.kind).toBe('tokens');
      if (entry.market_type === 'majority') {
        expect(m.kind).toBe('free-majority');
        expect(m.href).toBe(`/free-majority/${entry.id}`);
      } else {
        expect(m.kind).toBe('free-yesno');
        expect(m.href).toBe(`/free/${entry.id}`);
      }
    }
  });

  it('reads a resolved paid majority word as a winner or loser', () => {
    const resolved = { ...majList.markets[0], status: 1, words: [{ word: 'goal', wordHash: 'x', oddsPct: 50, outcome: 1 }] };
    const m = fromPaidMajority(resolved as never, NOW);
    expect(m.status).toBe('resolved');
    expect(m.words[0].outcome).toBe('winner');
  });
});

describe('sortMarkets', () => {
  it('puts an open featured market first', () => {
    const sorted = sortMarkets([fake({ id: 'a' }), fake({ id: 'b', isFeatured: true })]);
    expect(sorted[0].id).toBe('b');
  });

  it('does not hero a featured market that has resolved', () => {
    // The old behaviour pinned a finished market to the top of the tab.
    const stale = fake({ id: 'old', isFeatured: true, status: 'resolved' });
    const live = fake({ id: 'live' });
    expect(isHero(stale)).toBe(false);
    expect(sortMarkets([stale, live])[0].id).toBe('live');
  });

  it('orders open markets by the soonest close', () => {
    const later = fake({ id: 'later', lockAt: NOW + 10_000_000 });
    const sooner = fake({ id: 'sooner', lockAt: NOW + 1_000 });
    expect(sortMarkets([later, sooner]).map((m) => m.id)).toEqual(['sooner', 'later']);
  });

  it('orders finished markets by the most recent', () => {
    const old = fake({ id: 'old', status: 'resolved', lockAt: NOW - 10_000_000 });
    const recent = fake({ id: 'recent', status: 'resolved', lockAt: NOW - 1_000 });
    expect(sortMarkets([old, recent]).map((m) => m.id)).toEqual(['recent', 'old']);
  });

  it('ranks open above pending above finished', () => {
    const rows = [
      fake({ id: 'cancelled', status: 'cancelled' }),
      fake({ id: 'resolved', status: 'resolved' }),
      fake({ id: 'pending', status: 'pending' }),
      fake({ id: 'open' }),
    ];
    expect(sortMarkets(rows).map((m) => m.id)).toEqual(['open', 'pending', 'resolved', 'cancelled']);
  });

  it('leaves the input array untouched', () => {
    const rows = [fake({ id: 'a' }), fake({ id: 'b', isFeatured: true })];
    sortMarkets(rows);
    expect(rows.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('puts markets with no close date last among open ones', () => {
    const dated = fake({ id: 'dated', lockAt: NOW + 5_000 });
    const undated = fake({ id: 'undated', lockAt: null });
    expect(sortMarkets([undated, dated]).map((m) => m.id)).toEqual(['dated', 'undated']);
  });
});

describe('filterMarkets', () => {
  const rows = [fake({ id: 'paid' }), fake({ id: 'free', kind: 'free-yesno' })];

  it('returns everything for all', () => {
    expect(filterMarkets(rows, 'all')).toHaveLength(2);
  });

  it('splits paid from free', () => {
    expect(filterMarkets(rows, 'paid').map((m) => m.id)).toEqual(['paid']);
    expect(filterMarkets(rows, 'free').map((m) => m.id)).toEqual(['free']);
  });
});

describe('sectionMarkets', () => {
  it('groups by status and drops empty sections', () => {
    const sections = sectionMarkets(sortMarkets([fake({ id: 'a' }), fake({ id: 'b', status: 'resolved' })]));
    expect(sections.map((s) => s.key)).toEqual(['open', 'resolved']);
    expect(sections[0].title).toBe('Open');
    expect(sections[1].data).toHaveLength(1);
  });

  it('returns nothing for an empty feed', () => {
    expect(sectionMarkets([])).toEqual([]);
  });
});

describe('mergeMarkets', () => {
  const merged = mergeMarkets(majList.markets as never, ammList.markets as never, freeList.markets as never, NOW);

  it('includes every market from all three routes', () => {
    expect(merged).toHaveLength(majList.markets.length + ammList.markets.length + freeList.markets.length);
  });

  it('gives every row a unique route', () => {
    const keys = merged.map((m) => `${m.kind}:${m.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('comes back sorted', () => {
    expect(merged.map((m) => m.id)).toEqual(sortMarkets(merged).map((m) => m.id));
  });
});
