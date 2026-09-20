// Where a trending word goes when it is tapped.
//
// The feed's `href` is a website path (`/paid/<slug>`, `/paidmajority/<slug>`,
// `/free/<slug>`), and the app addresses paid and majority markets by id. The
// `id` field carries what is actually needed, so it is parsed rather than the
// href: a paid word names its market id outright, and a majority word names a
// slug that the metadata route can turn into one.
import type { TrendingWord } from '@/api/sidebar';

export type TrendingLink = { word: TrendingWord; href: string };

/**
 * An app route for `word`, or null when it cannot be reached yet.
 *
 * `majorityIdBySlug` comes from the paid-majority metadata, which every
 * screen already has; a slug missing from it means the market is not one this
 * build can open, so the word is dropped rather than linked into nothing.
 */
export function trendingHref(word: TrendingWord, majorityIdBySlug: Map<string, string>): string | null {
  const [kind, key, ...rest] = word.id.split(':');
  if (!key) return null;
  if (kind === 'paid') return /^\d+$/.test(key) ? `/paid/${key}` : null;
  if (kind === 'paidmaj') {
    const id = majorityIdBySlug.get(key);
    return id ? `/majority/${id}` : null;
  }
  // A free market is a slug on the website and an id in the app; the app's
  // free route resolves either, and picks the majority screen when it must.
  if (kind === 'free') return rest.length > 0 || key ? `/free/${encodeURIComponent(key)}` : null;
  return null;
}

/** The linkable trending words, live ones first, at most `limit`. */
export function trendingLinks(words: TrendingWord[], majorityIdBySlug: Map<string, string>, limit = 8): TrendingLink[] {
  const out: TrendingLink[] = [];
  for (const word of [...words].sort((a, b) => Number(b.live) - Number(a.live))) {
    const href = trendingHref(word, majorityIdBySlug);
    if (href) out.push({ word, href });
    if (out.length === limit) break;
  }
  return out;
}
