import type { TrendingWord } from '@/api/sidebar';
import { trendingHref, trendingLinks } from '@/lib/trending';

const word = (id: string, live = true): TrendingWord => ({
  id,
  word: 'palmer',
  market_title: 'A market',
  href: '/whatever',
  paid: true,
  live,
  trader_count: 3,
  trade_count: 4,
});

const majority = new Map([['FOOTBALL-0ed06f', '1789214048382']]);

describe('trendingHref', () => {
  it('routes a paid word by the market id in its own key', () => {
    expect(trendingHref(word('paid:1789322327122:3'), majority)).toBe('/paid/1789322327122');
  });

  it('routes a majority word by resolving its slug', () => {
    expect(trendingHref(word('paidmaj:FOOTBALL-0ed06f:palmer'), majority)).toBe('/majority/1789214048382');
  });

  it('drops a majority word whose market this build cannot open', () => {
    expect(trendingHref(word('paidmaj:UNKNOWN-1:palmer'), majority)).toBeNull();
  });

  it('leaves a free slug for the free route to resolve', () => {
    expect(trendingHref(word('free:NFL-06ffba:giants'), majority)).toBe('/free/NFL-06ffba');
  });

  it('refuses anything it does not recognise', () => {
    expect(trendingHref(word('polymarket:abc:def'), majority)).toBeNull();
    expect(trendingHref(word('paid:not-a-number:3'), majority)).toBeNull();
    expect(trendingHref(word('nonsense'), majority)).toBeNull();
  });
});

describe('trendingLinks', () => {
  it('keeps only what it can route, live first, up to the limit', () => {
    const links = trendingLinks(
      [word('paidmaj:UNKNOWN-1:x'), word('paid:1:0', false), word('free:NFL-06ffba:giants'), word('paid:2:0')],
      majority,
      2,
    );
    expect(links.map((l) => l.href)).toEqual(['/free/NFL-06ffba', '/paid/2']);
  });
});
