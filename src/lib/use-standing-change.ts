// How the player's week has moved since they last looked at Home: points
// gained and places climbed, from the weekly board Home already polls.
//
// The comparison point is fixed when Home comes into view and held for the
// visit, so the "▲4" does not vanish on the next poll; what is saved for next
// time follows every poll, so the next visit compares against the last thing
// seen. Points gained are toasted once per visit.
import { useEffect, useRef, useState } from 'react';

import type { Leaderboard } from '@/api/user';
import { standingChange, standingOf, type Standing } from '@/markets/moments';
import { useMoments } from '@/store/moments';
import { showPoints } from '@/ui/toast';

type Change = { standing: Standing; points: number; places: number };

export function useStandingChange(wallet: string | null, board: Leaderboard | undefined, focused: boolean): { standing: Standing | null; change: Change | null } {
  const hydrated = useMoments((s) => s.hydrated);
  const setStanding = useMoments((s) => s.setStanding);
  const standing = wallet && board ? standingOf(board, wallet) : null;
  const [change, setChange] = useState<Change | null>(null);
  // Per visit: the standing Home is compared against, and whether its points were toasted.
  const visit = useRef<{ baseline?: Standing; captured: boolean; toasted: boolean }>({ captured: false, toasted: false });

  const week = standing?.week;
  const points = standing?.points;
  const rank = standing?.rank;

  useEffect(() => {
    if (!focused) {
      visit.current = { captured: false, toasted: false };
      return;
    }
    if (!hydrated || !wallet || week === undefined || points === undefined || rank === undefined) return;
    const current: Standing = { week, points, rank };
    if (!visit.current.captured) visit.current = { baseline: useMoments.getState().standing[wallet], captured: true, toasted: false };
    const moved = standingChange(visit.current.baseline, current);
    setChange(moved ? { standing: current, ...moved } : null);
    if (moved && moved.points > 0 && !visit.current.toasted) {
      visit.current.toasted = true;
      showPoints(moved.points, 'Earned this week since you last looked');
    }
    setStanding(wallet, current);
  }, [focused, hydrated, wallet, week, points, rank, setStanding]);

  return { standing, change: change && change.standing.week === week ? change : null };
}
