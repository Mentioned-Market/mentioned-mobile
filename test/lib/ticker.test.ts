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
  it('reads a majority pick', () => {
    const [i] = tickerItems([base]);
    expect(i.who).toBe('bigdawg');
    expect(i.text).toBe('picked run for $1.00');
    expect(i.href).toBe('/majority/1789214048382');
  });
  it('reads a paid YES/NO trade without inventing a word', () => {
    const [i] = tickerItems([{ ...base, id: 'p', type: 'paid', isYes: false, amountUsd: '510000', wordLabel: null }]);
    expect(i.text).toBe('bought NO for $0.51');
    expect(i.href).toBe('/paid/1789214048382');
  });
  it('reads a free sale in tokens and links by slug', () => {
    const [i] = tickerItems([{ ...base, id: 'f', type: 'free', isBuy: false, isYes: false, amountUsd: '0', wordLabel: 'Diallo', cost: '149.996276', slug: 'FOOTBALL-796cc0', marketId: '113' }]);
    expect(i.text).toBe('sold NO Diallo for 150 tokens');
    expect(i.href).toBe('/free/FOOTBALL-796cc0');
    expect(i.up).toBe(false);
  });
  it('leaves Polymarket rows out and falls back to the address', () => {
    const items = tickerItems([{ ...base, id: 'pm', type: 'polymarket' }, { ...base, id: 'anon', username: null }]);
    expect(items).toHaveLength(1);
    expect(items[0].who).toBe('49GT…u2fY');
  });
});
