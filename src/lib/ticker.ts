// One line per trade for the ticker, and where a tap on it goes.
import type { RecentTrade } from '@/api/ticker';
import { shortAddress, tokens, usdc } from '@/lib/format';

export type TickerItem = { key: string; emoji: string; who: string; text: string; href: string | null; up: boolean };

/** Free markets are addressed by slug from this feed; the free route resolves it. */
function hrefFor(t: RecentTrade): string | null {
  if (t.type === 'paid') return `/paid/${t.marketId}`;
  if (t.type === 'majority') return `/majority/${t.marketId}`;
  if (t.type === 'free') return t.slug ? `/free/${t.slug}` : `/free/${t.marketId}`;
  return null;
}

/**
 * "bigdawg picked run for $1" and the like. Polymarket rows are the
 * website's other product and are left out; a word the feed does not carry
 * (paid rows) is not invented.
 */
export function tickerItems(trades: RecentTrade[]): TickerItem[] {
  const out: TickerItem[] = [];
  for (const t of trades) {
    if (t.type === 'polymarket') continue;
    const who = t.username ?? shortAddress(t.wallet);
    const word = t.wordLabel ? ` ${t.wordLabel}` : '';
    let text: string;
    let emoji: string;
    if (t.type === 'majority') {
      emoji = '🏆';
      text = `picked${word} for ${usdc(t.amountUsd, { dp: 2 })}`;
    } else if (t.type === 'paid') {
      emoji = '💵';
      text = `${t.isBuy ? 'bought' : 'sold'} ${t.isYes ? 'YES' : 'NO'}${word} for ${usdc(t.amountUsd, { dp: 2 })}`;
    } else {
      emoji = '🎟️';
      const cost = Math.abs(Number(t.cost ?? 0));
      text = `${t.isBuy ? 'bought' : 'sold'} ${t.isYes ? 'YES' : 'NO'}${word}${cost > 0 ? ` for ${tokens(cost)} tokens` : ''}`;
    }
    out.push({ key: t.id, emoji, who, text, href: hrefFor(t), up: t.isBuy });
  }
  return out;
}
