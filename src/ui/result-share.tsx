// The share block on a result screen.
//
// A card is only worth sharing if it is about the person sharing it, so this
// draws nothing unless the signed-in wallet actually has a position in this
// market. That is also what the server enforces for the points: it refuses to
// award a share of a market the wallet never traded.
//
// A win card names dollars, so only paid markets can produce one. Free markets
// pay play tokens, and a card claiming "$150" for 150 tokens would be a lie in
// the one place it travels furthest.
import { useMemo } from 'react';

import { useFreeUserActivity, usePaidMajorityUserPositions, usePaidMarketUserPositions, useProfile } from '@/api/queries';
import type { ShareCard } from '@/api/share';
import { useSession } from '@/store/session';
import { ShareButton } from '@/ui/share-button';

export type ShareFamily = 'paid-markets' | 'paid-majority' | 'free';

export function ResultShare({ family, marketId, title }: { family: ShareFamily; marketId: string; title: string }) {
  const wallet = useSession((s) => s.wallet);
  const profile = useProfile(wallet);
  // Each query is enabled only for the family being looked at; the other two idle.
  const paid = usePaidMarketUserPositions(family === 'paid-markets' ? wallet : null, false);
  const majority = usePaidMajorityUserPositions(family === 'paid-majority' ? wallet : null, false);
  const free = useFreeUserActivity(family === 'free' ? wallet : null, false);

  const card = useMemo((): ShareCard | null => {
    if (family === 'paid-markets') {
      const mine = (paid.data ?? []).filter((p) => p.marketId === marketId);
      if (mine.length === 0) return null;
      // The biggest holding is the one worth showing.
      const best = mine.reduce((a, b) => (Number(b.estValueUsdc) > Number(a.estValueUsdc) ? b : a));
      const side = BigInt(best.yesShares) >= BigInt(best.noShares) ? 'YES' : 'NO';
      const held = side === 'YES' ? BigInt(best.yesShares) : BigInt(best.noShares);
      const won = best.outcome !== null && (best.outcome ? 'YES' : 'NO') === side;
      if (won && held > 0n) return { kind: 'win', amountUsd: Number(held) / 1e6, market: title };
      return { kind: 'position', side, word: best.wordLabel, pct: Math.round((side === 'YES' ? best.yesPrice : best.noPrice) * 100), market: title };
    }

    if (family === 'paid-majority') {
      const mine = (majority.data ?? []).filter((p) => p.marketId === marketId);
      if (mine.length === 0) return null;
      const claimable = mine.reduce((sum, p) => sum + p.claimableUsdc, 0);
      if (claimable > 0) return { kind: 'win', amountUsd: claimable, market: title };
      const best = mine.reduce((a, b) => (b.stakeUsdc > a.stakeUsdc ? b : a));
      return { kind: 'majority', word: best.word, stakeUsd: best.stakeUsdc, market: title };
    }

    const mine = (free.data?.positions ?? []).filter((p) => String(p.market_id) === marketId);
    if (mine.length === 0) return null;
    const first = mine[0];
    if (first.market_type === 'majority') return { kind: 'majority', word: first.word, market: title };
    const side = Number(first.yes_shares) >= Number(first.no_shares) ? 'YES' : 'NO';
    return { kind: 'position', side, word: first.word, market: title };
  }, [family, marketId, title, paid.data, majority.data, free.data]);

  if (!wallet || !card) return null;

  return (
    <ShareButton
      card={card}
      marketId={marketId}
      // Share points are a paid-market reward; a free card just shares.
      family={family === 'free' ? null : family}
      refCode={profile.data?.referralCode ?? null}
      signedIn
    />
  );
}
