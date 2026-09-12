// Sharing a result or a position.
//
// Three separate things happen, and only the first always does:
//  1. The Android share sheet goes out with the sharer's own link. The link
//     unfurls into the card image the website renders, and carries the
//     referral code, so a click both shows the card and credits the referrer.
//  2. `recordShare` tells the server it happened, which unlocks the sharing
//     achievements. It needs a session, not proof.
//  3. Share points for a paid market need proof: the server will only award
//     them for a real X post link, and only to a wallet that traded that
//     market. So that is a second, deliberate step, never automatic.
import { z } from 'zod';

import { API_BASE } from '@/config';
import { post } from './client';

/** What is being shared. The website's own three kinds. */
export type ShareCard =
  | { kind: 'win'; amountUsd: number; market?: string }
  | { kind: 'position'; side: 'YES' | 'NO'; word: string; pct?: number; market?: string }
  | { kind: 'majority'; word: string; stakeUsd?: number; market?: string };

/**
 * The link to share: the sharer's referral path with the card in its query, as
 * `ShareCardButton` on the web builds it. Points at whichever deployment the
 * app is pointed at, so a devnet build shares devnet links.
 */
export function shareUrl(card: ShareCard, refCode: string | null): string {
  const p = new URLSearchParams();
  if (card.kind === 'win') {
    p.set('k', 'win');
    p.set('a', card.amountUsd.toFixed(2));
  } else if (card.kind === 'majority') {
    p.set('k', 'majority');
    p.set('w', card.word);
    if (card.stakeUsd != null) p.set('a', card.stakeUsd.toFixed(2));
  } else {
    p.set('k', 'position');
    p.set('s', card.side);
    p.set('w', card.word);
    if (card.pct != null) p.set('p', String(Math.round(card.pct)));
  }
  if (card.market) p.set('m', card.market);
  return `${API_BASE}${refCode ? `/ref/${refCode}` : '/'}?${p.toString()}`;
}

/** The card image itself, for showing what is about to be shared. */
export function shareCardImageUrl(card: ShareCard, username: string, refCode: string | null): string {
  const p = new URLSearchParams({ u: username });
  if (refCode) p.set('ref', refCode);
  if (card.kind === 'win') {
    p.set('kind', 'win');
    p.set('amount', card.amountUsd.toFixed(2));
  } else if (card.kind === 'majority') {
    p.set('kind', 'majority');
    p.set('word', card.word);
    if (card.stakeUsd != null) p.set('amount', card.stakeUsd.toFixed(2));
  } else {
    p.set('kind', 'position');
    p.set('side', card.side);
    p.set('word', card.word);
    if (card.pct != null) p.set('pct', String(Math.round(card.pct)));
  }
  if (card.market) p.set('market', card.market);
  return `${API_BASE}/api/share/card?${p.toString()}`;
}

/** The words that go out with the link. The website's wording. */
export function shareText(card: ShareCard): string {
  if (card.kind === 'win') return `I just won $${card.amountUsd.toFixed(2)} on Mentioned 🏆 Predicting what gets said, live 👇`;
  if (card.kind === 'majority') return `I'm backing "${card.word}" on Mentioned 🎯 Predicting what gets said, live 👇`;
  return `I'm holding ${card.side} on "${card.word}" on Mentioned 📈 Predicting what gets said, live 👇`;
}

const AchievementUnlock = z.object({ id: z.string(), emoji: z.string(), title: z.string(), points: z.number() });
export type AchievementUnlock = z.infer<typeof AchievementUnlock>;

/**
 * Tell the server a card went out, and get back any achievement it unlocked.
 * The server counts a majority card as a position, which is the only kind it
 * takes besides a win.
 */
export const recordShare = (kind: ShareCard['kind'], marketRef: string | null) =>
  post(
    '/api/share/record',
    { kind: kind === 'win' ? 'win' : 'position', marketRef },
    z.object({ ok: z.boolean(), newAchievements: z.array(AchievementUnlock).default([]) }),
  );

export const SharePoints = z.object({ ok: z.boolean(), awarded: z.number(), alreadyShared: z.boolean() });
export type SharePoints = z.infer<typeof SharePoints>;

/**
 * Claim the one-time points for sharing a paid market, proving it with the
 * link to the post. Refused unless the wallet actually traded that market.
 */
export const claimSharePoints = (family: 'paid-markets' | 'paid-majority', marketId: string, tweetUrl: string) =>
  post(`/api/${family}/share`, { marketId, tweetUrl }, SharePoints);

/** What the server accepts as proof, checked here so a typo is caught first. */
export const isPostUrl = (url: string) => /^https?:\/\/(www\.)?(x|twitter)\.com\/[^/]+\/status\/\d+/i.test(url.trim());
