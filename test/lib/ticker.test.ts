import type { RecentTrade } from '@/api/ticker';
import { tickerItems } from '@/lib/ticker';

const base: RecentTrade = {
  id: 'x',
  wallet: '49GT1N8mRLp4Q9JYJDRR3YopGtfHFGTrwg6cmbm3u2fY',
  username: 'bigdawg',
  marketId: '1789214048382',
  isYes: true,
  isBuy: true,
  amountUsd: '1000000',
  marketTitle: 'Rangers vs Red Sox',
  createdAt: '2026-09-15T20:23:52.291Z',
  type: 'majority',
  wordLabel: 'run',
  cost: null,
  slug: 'BASEBALL-0e103b',
};

describe('tickerItems', () => {
  it('reads a majority pick, which has no side', () => {
    const [i] = tickerItems([base]);
    expect(i).toMatchObject({ who: 'bigdawg', verb: 'picked', side: null, word: 'run', amount: '$1.00', href: '/majority/1789214048382' });
  });

  it('reads a paid trade with its side and no invented word', () => {
    const [i] = tickerItems([{ ...base, id: 'p', type: 'paid', isYes: false, amountUsd: '510000', wordLabel: null }]);
    expect(i).toMatchObject({ verb: 'bought', side: 'NO', word: null, amount: '$0.51', href: '/paid/1789214048382' });
  });

  it('reads a free sale in tokens and links by slug', () => {
    const [i] = tickerItems([
      { ...base, id: 'f', type: 'free', isBuy: false, isYes: false, amountUsd: '0', wordLabel: 'Diallo', cost: '149.996276', slug: 'FOOTBALL-796cc0', marketId: '113' },
    ]);
    expect(i).toMatchObject({ verb: 'sold', side: 'NO', word: 'Diallo', amount: '150 tk', href: '/free/FOOTBALL-796cc0' });
  });

  it('leaves Polymarket rows out and falls back to the address', () => {
    const items = tickerItems([{ ...base, id: 'pm', type: 'polymarket' }, { ...base, id: 'anon', username: null }]);
    expect(items).toHaveLength(1);
    expect(items[0].who).toBe('49GT…u2fY');
  });

  it('carries the market title and when the trade was made, for the feed', () => {
    const [i] = tickerItems([base]);
    expect(i.title).toBe('Rangers vs Red Sox');
    expect(i.at).toBe(Date.parse('2026-09-15T20:23:52.291Z'));
  });
});
