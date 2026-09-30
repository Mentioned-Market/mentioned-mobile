// One item per trade for the activity feed on Home, and where a tap on it goes.
//
// Split into parts rather than a sentence: the feed puts the name, the side
// and the amount in fixed places so a column of them can be scanned.
import type { RecentTrade } from '@/api/ticker';
import { shortAddress, tokens, usdc } from '@/lib/format';
import { toMs } from '@/lib/time';

export type TickerItem = {
  key: string;
  who: string;
  /** "bought", "sold" or "picked". */
  verb: string;
  /** The side, where the family has one; majority picks do not. */
  side: 'YES' | 'NO' | null;
  word: string | null;
  amount: string;
  href: string | null;
  /** The market's title, where the feed carries one. */
  title: string | null;
  /** When the trade was made, in ms. */
  at: number | null;
};

/** Free markets are addressed by slug from this feed; the free route resolves it. */
function hrefFor(t: RecentTrade): string | null {
  if (t.type === 'paid') return `/paid/${t.marketId}`;
  if (t.type === 'majority') return `/majority/${t.marketId}`;
  if (t.type === 'free') return t.slug ? `/free/${t.slug}` : `/free/${t.marketId}`;
  return null;
}

/**
 * Polymarket rows are the website's other product and are left out. A word the
 * feed does not carry (paid rows often have none) is not invented.
 */
export function tickerItems(trades: RecentTrade[]): TickerItem[] {
  const out: TickerItem[] = [];
  for (const t of trades) {
    if (t.type === 'polymarket') continue;
    const who = t.username ?? shortAddress(t.wallet);
    const word = t.wordLabel ?? null;
    const base = { key: t.id, who, word, href: hrefFor(t), title: t.marketTitle, at: toMs(t.createdAt) };
    if (t.type === 'majority') {
      out.push({ ...base, verb: 'picked', side: null, amount: usdc(t.amountUsd, { dp: 2 }) });
      continue;
    }
    const verb = t.isBuy ? 'bought' : 'sold';
    const side = t.isYes ? 'YES' : 'NO';
    if (t.type === 'paid') {
      out.push({ ...base, verb, side, amount: usdc(t.amountUsd, { dp: 2 }) });
      continue;
    }
    const cost = Math.abs(Number(t.cost ?? 0));
    out.push({ ...base, verb, side, amount: cost > 0 ? `${tokens(cost)} tk` : '' });
  }
  return out;
}
