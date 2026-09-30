// The card is memoised, so this predicate decides whether a change reaches the
// screen. A wrong `false` only costs a re-render; a wrong `true` silently
// freezes a price, a countdown or a result in front of the user, which is the
// failure worth pinning here.
import { sameMarket, type MarketSummary } from '@/markets/merge';

const BASE: MarketSummary = {
  kind: 'paid-yesno',
  id: 'm1',
  href: '/paid/m1',
  title: 'Will he say it?',
  cover: 'https://example.test/a.png',
  status: 'open',
  lockAt: Date.parse('2026-09-11T12:00:00Z'),
  eventAt: Date.parse('2026-09-11T20:00:00Z'),
  words: [
    { label: 'yes', pct: 0.61, outcome: null },
    { label: 'no', pct: 0.39, outcome: null },
  ],
  pool: { kind: 'usdc', usd: 420 },
  traderCount: 33,
  isFeatured: false,
};

/** A fresh object with the same contents, as mergeMarkets produces each tick. */
const clone = (m: MarketSummary = BASE): MarketSummary => ({
  ...m,
  words: m.words.map((w) => ({ ...w })),
  pool: { ...m.pool },
});

describe('sameMarket', () => {
  it('matches a structurally identical rebuild', () => {
    // This is the whole point: mergeMarkets runs on a 30s clock and hands the
    // card a brand new object every time, so reference equality is useless.
    expect(sameMarket(BASE, clone())).toBe(true);
    expect(BASE).not.toBe(clone());
  });

  it.each([
    ['title', { title: 'Something else' }],
    ['status', { status: 'resolved' as const }],
    ['cover', { cover: 'https://example.test/b.png' }],
    ['lock time', { lockAt: BASE.lockAt! + 60_000 }],
    ['event time', { eventAt: BASE.eventAt! + 60_000 }],
    ['trader count', { traderCount: 34 }],
    ['id', { id: 'm2' }],
    ['kind', { kind: 'free-yesno' as const }],
    ['href', { href: '/paid/m2' }],
  ])('notices a changed %s', (_label, patch) => {
    expect(sameMarket(BASE, { ...clone(), ...patch })).toBe(false);
  });

  it('notices a moved price', () => {
    const moved = clone();
    moved.words[0].pct = 0.62;
    expect(sameMarket(BASE, moved)).toBe(false);
  });

  it('notices a settled outcome', () => {
    const settled = clone();
    settled.words[0].outcome = 'yes';
    expect(sameMarket(BASE, settled)).toBe(false);
  });

  it('notices a renamed word', () => {
    const renamed = clone();
    renamed.words[1].label = 'maybe';
    expect(sameMarket(BASE, renamed)).toBe(false);
  });

  it('notices a word being added or removed', () => {
    const fewer = clone();
    fewer.words = fewer.words.slice(0, 1);
    expect(sameMarket(BASE, fewer)).toBe(false);
  });

  it('notices a growing pool', () => {
    expect(sameMarket(BASE, { ...clone(), pool: { kind: 'usdc', usd: 500 } })).toBe(false);
  });

  it('notices the pool changing currency', () => {
    expect(sameMarket(BASE, { ...clone(), pool: { kind: 'tokens', tokens: 420 } })).toBe(false);
  });

  it('notices a token pool moving', () => {
    const tokenMarket: MarketSummary = { ...clone(), pool: { kind: 'tokens', tokens: 100 } };
    expect(sameMarket(tokenMarket, { ...clone(), pool: { kind: 'tokens', tokens: 200 } })).toBe(false);
  });

  it('ignores isFeatured, which the card does not render', () => {
    expect(sameMarket(BASE, { ...clone(), isFeatured: true })).toBe(true);
  });
});
