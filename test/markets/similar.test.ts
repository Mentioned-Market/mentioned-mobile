import type { MarketSummary } from '@/markets/merge';
import { similarMarkets } from '@/markets/similar';

const market = (kind: MarketSummary['kind'], id: string, status: MarketSummary['status'] = 'open'): MarketSummary => ({
  kind,
  id,
  href: `/x/${id}`,
  title: `Market ${id}`,
  cover: null,
  status,
  lockAt: null,
  eventAt: null,
  words: [],
  pool: { kind: 'usdc', usd: 0 },
  traderCount: 0,
  isFeatured: false,
});

describe('similarMarkets', () => {
  const all = [
    market('paid-yesno', '1'),
    market('paid-majority', '2'),
    market('paid-yesno', '3'),
    market('free-yesno', '4'),
    market('paid-yesno', '5', 'resolved'),
  ];

  it('leaves out the market being looked at', () => {
    expect(similarMarkets(all, 'paid-yesno:1').map((m) => m.id)).not.toContain('1');
  });

  it('leaves out anything that has finished', () => {
    expect(similarMarkets(all, 'paid-yesno:1').map((m) => m.id)).not.toContain('5');
  });

  it('puts markets of the same kind first', () => {
    expect(similarMarkets(all, 'paid-yesno:1').map((m) => m.id)).toEqual(['3', '2', '4']);
  });

  it('honours the limit', () => {
    expect(similarMarkets(all, 'paid-majority:2', 2).map((m) => m.id)).toEqual(['1', '3']);
  });

  it('is empty when nothing else is open', () => {
    expect(similarMarkets([market('paid-yesno', '1')], 'paid-yesno:1')).toEqual([]);
  });
});
