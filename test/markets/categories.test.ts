// The category filter on Markets, and how it sits with All / Free / Paid.
import { Categories, type MarketCategory } from '@/api/categories';
import { activeCategory, chooseFilter, filterByCategory, filterCounts, usedCategories } from '@/markets/categories';
import { filterMarkets, mergeMarkets, type MarketSummary } from '@/markets/merge';

import categoriesFixture from '../fixtures/categories.json';
import freeList from '../fixtures/custom-list.json';
import majList from '../fixtures/paid-majority-list.json';
import ammList from '../fixtures/paid-markets-list.json';

const CATEGORIES: MarketCategory[] = [
  { slug: 'football', name: 'Football', sort_order: 10 },
  { slug: 'nfl', name: 'NFL', sort_order: 20 },
  { slug: 'earnings', name: 'Earnings', sort_order: 30 },
];

const market = (kind: MarketSummary['kind'], category: string | null) => ({ kind, category });

const LIST = [
  market('paid-majority', 'nfl'),
  market('paid-yesno', 'nfl'),
  market('free-yesno', 'nfl'),
  market('free-majority', 'football'),
  market('paid-yesno', null),
];

describe('the categories route', () => {
  it('parses the captured production response', () => {
    const parsed = Categories.parse(categoriesFixture);
    expect(parsed.categories.length).toBeGreaterThan(0);
    expect(parsed.categories[0]).toEqual(expect.objectContaining({ slug: expect.any(String), name: expect.any(String) }));
  });

  it('reads a list from before categories as uncategorised, not as broken', () => {
    const merged = mergeMarkets(majList.markets as never, ammList.markets as never, freeList.markets as never, Date.parse('2026-09-10T12:00:00Z'));
    expect(merged.length).toBeGreaterThan(0);
    expect(merged.every((m) => m.category === null)).toBe(true);
    expect(usedCategories(CATEGORIES, merged)).toEqual([]);
  });
});

describe('usedCategories', () => {
  it('offers only categories a listed market carries, in the list\'s own order', () => {
    expect(usedCategories(CATEGORIES, LIST).map((c) => c.slug)).toEqual(['football', 'nfl']);
  });

  it('offers nothing for a slug the list does not know', () => {
    expect(usedCategories(CATEGORIES, [market('paid-yesno', 'tech')])).toEqual([]);
  });
});

describe('activeCategory', () => {
  const offered = usedCategories(CATEGORIES, LIST);

  it('keeps a category that is still offered', () => {
    expect(activeCategory('nfl', offered)).toBe('nfl');
  });

  it('lets go of one whose last market has left the list', () => {
    expect(activeCategory('earnings', offered)).toBeNull();
    expect(activeCategory(null, offered)).toBeNull();
  });
});

describe('filterByCategory and filterCounts', () => {
  it('narrows to the category, and to everything without one', () => {
    expect(filterByCategory(LIST, 'nfl')).toHaveLength(3);
    expect(filterByCategory(LIST, null)).toHaveLength(5);
  });

  it('counts each tab within the category in force', () => {
    expect(filterCounts(LIST)).toEqual({ paid: 3, free: 2 });
    expect(filterCounts(filterByCategory(LIST, 'nfl'))).toEqual({ paid: 2, free: 1 });
    expect(filterCounts(filterByCategory(LIST, 'football'))).toEqual({ paid: 0, free: 1 });
  });

  it('agrees with what the tab then shows', () => {
    const inNfl = filterByCategory(LIST, 'nfl') as unknown as MarketSummary[];
    const counts = filterCounts(inNfl);
    expect(filterMarkets(inNfl, 'paid')).toHaveLength(counts.paid);
    expect(filterMarkets(inNfl, 'free')).toHaveLength(counts.free);
  });
});

describe('chooseFilter', () => {
  it('keeps the category when moving between Free and Paid', () => {
    expect(chooseFilter('paid', 'nfl')).toEqual({ filter: 'paid', category: 'nfl' });
    expect(chooseFilter('free', 'nfl')).toEqual({ filter: 'free', category: 'nfl' });
  });

  it('clears the category on All, which means everything', () => {
    expect(chooseFilter('all', 'nfl')).toEqual({ filter: 'all', category: null });
  });
});
