// Where a notification goes when it is tapped.
//
// The server writes website paths ("/market/123", "/paidmajority/456",
// "/free/vikings-packers") because the same row feeds the website, a Discord DM
// and a Telegram message. The app has its own routes, so every path has to be
// translated, and one of them cannot be translated on the spot: a free market
// is addressed by slug on the web and by id everywhere in the app.
//
// Anything unrecognised returns null rather than guessing. A tap that does
// nothing is better than a tap that opens the wrong market, and the row still
// reads perfectly well on its own.
import { API_BASE } from '@/config';

export type NotificationTarget =
  /** Ready to push. */
  | { kind: 'route'; href: string }
  /** A free market, addressed by slug: resolve the id, then the market's type. */
  | { kind: 'free-slug'; slug: string }
  | null;

/** A path this app can act on, from whatever the server wrote. */
export function notificationTarget(link: string | null | undefined): NotificationTarget {
  if (!link) return null;
  const path = stripOrigin(link.trim());
  if (!path.startsWith('/')) return null;
  // Query strings and fragments belong to the website, never to a route here.
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '');

  const market = /^\/market\/(\d+)$/.exec(clean);
  if (market) return { kind: 'route', href: `/paid/${market[1]}` };

  const majority = /^\/paidmajority\/(\d+)$/.exec(clean);
  if (majority) return { kind: 'route', href: `/majority/${majority[1]}` };

  const free = /^\/free\/([A-Za-z0-9_-]{1,120})$/.exec(clean);
  if (free) return /^\d+$/.test(free[1]) ? { kind: 'route', href: `/free/${free[1]}` } : { kind: 'free-slug', slug: free[1] };

  const profile = /^\/u\/([A-Za-z0-9_]{1,40})$/.exec(clean);
  if (profile) return { kind: 'route', href: `/u/${profile[1]}` };

  return null;
}

/**
 * Drop the origin from an absolute link, but only when it is one of ours. A
 * link to somewhere else is not something to open inside the app.
 */
function stripOrigin(link: string): string {
  if (!/^https?:\/\//i.test(link)) return link;
  try {
    const url = new URL(link);
    const host = url.hostname.replace(/^www\./, '');
    const ours = new URL(API_BASE).hostname.replace(/^www\./, '');
    if (host !== ours && host !== 'mentioned.market') return '';
    return `${url.pathname}${url.search}`;
  } catch {
    return '';
  }
}
