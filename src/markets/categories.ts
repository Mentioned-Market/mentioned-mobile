// Filtering the Markets tab by category, on top of All / Free / Paid.
//
// The rules are the website's (app/markets/page.tsx): a category is offered
// only while a listed market carries it; choosing one narrows every tab and
// its count; and "All" means everything, so it clears the category too.
import type { MarketCategory } from '@/api/categories';
import { isPaid, type MarketFilter, type MarketSummary } from '@/markets/merge';

/**
 * The categories worth offering: those at least one listed market carries,
 * in the list's own order. A category nobody has used yet would only ever
 * open an empty page.
 */
export function usedCategories(categories: readonly MarketCategory[], markets: readonly Pick<MarketSummary, 'category'>[]): MarketCategory[] {
  const used = new Set(markets.map((m) => m.category).filter((c): c is string => !!c));
  return categories.filter((c) => used.has(c.slug));
}

/**
 * The category actually in force. A chosen one that is no longer offered (its
 * last market left the list while the screen was open) stops applying, so the
 * list never sits empty behind a filter that can no longer be seen.
 */
export function activeCategory(selected: string | null, offered: readonly MarketCategory[]): string | null {
  return selected && offered.some((c) => c.slug === selected) ? selected : null;
}

export function filterByCategory<M extends Pick<MarketSummary, 'category'>>(markets: readonly M[], slug: string | null): M[] {
  return slug ? markets.filter((m) => m.category === slug) : [...markets];
}

/** How many markets each tab would show, within the category in force. */
export function filterCounts(markets: readonly Pick<MarketSummary, 'kind'>[]): Record<Exclude<MarketFilter, 'all'>, number> {
  const paid = markets.filter(isPaid).length;
  return { paid, free: markets.length - paid };
}

/** What choosing a tab does to the pair. "All" is everything, so it lets go of the category as well. */
export function chooseFilter(filter: MarketFilter, category: string | null): { filter: MarketFilter; category: string | null } {
  return { filter, category: filter === 'all' ? null : category };
}
