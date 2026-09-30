// The small moments the app marks for a player: a market they won, and how
// their week has moved since they last looked. Pure rules; what the phone
// remembers between visits lives in `src/store/moments.ts`.
import type { Leaderboard } from '@/api/user';
import type { MarketGroup } from '@/markets/positions';

// ── Wins ────────────────────────────────────────────────────────────────────

/** How many celebrated market keys are kept beyond the ones still listed. */
export const CELEBRATED_KEEP = 30;

const isWin = (g: MarketGroup) => g.finished && g.won === true;

/**
 * The finished wins that have not had their moment yet, in list order.
 *
 * `celebrated` undefined means this wallet has never been seen on this phone,
 * and nothing is pending: its existing wins are remembered without a moment
 * (`rememberWins` with every current win), so the first launch after an
 * update does not replay a season of old wins one after another.
 */
export function pendingWins(finished: MarketGroup[], celebrated: readonly string[] | undefined): MarketGroup[] {
  if (celebrated === undefined) return [];
  const seen = new Set(celebrated);
  return finished.filter((g) => isWin(g) && !seen.has(g.key));
}

/** Every finished win's key, for remembering a wallet's history on first sight. */
export const winKeys = (finished: MarketGroup[]) => finished.filter(isWin).map((g) => g.key);

/**
 * The celebrated keys after adding `add`. A win is marked when its moment is
 * dismissed, not when it is found, so one found as the app closes still gets
 * its moment next time.
 *
 * Every key for a win still in the list is kept, however many, so a win can
 * never be forgotten and celebrated twice. Keys the list no longer carries are
 * trimmed to `CELEBRATED_KEEP`, newest first.
 */
export function rememberWins(finished: MarketGroup[], celebrated: readonly string[] | undefined, add: string[]): string[] {
  const listed = new Set(winKeys(finished));
  const all = [...new Set([...add, ...(celebrated ?? [])])];
  return [...all.filter((k) => listed.has(k)), ...all.filter((k) => !listed.has(k)).slice(0, CELEBRATED_KEEP)];
}

// ── Standing ────────────────────────────────────────────────────────────────

/** Where a wallet stood on the weekly board when it was last looked at. */
export type Standing = { week: string; points: number; rank: number | null };

/** The wallet's place on the board: its rank when it is on the list, its points either way. */
export function standingOf(board: Leaderboard, wallet: string): Standing | null {
  const i = board.data.findIndex((e) => e.wallet === wallet);
  if (i >= 0) return { week: board.weekStart, points: board.data[i].weeklyPoints, rank: i + 1 };
  if (board.userEntry?.wallet === wallet) return { week: board.weekStart, points: board.userEntry.weeklyPoints, rank: null };
  return null;
}

/**
 * What changed since the last look: points gained and places climbed (negative
 * for places dropped). Null when there is nothing to say, including across a
 * week boundary, where both reset and a comparison would be meaningless.
 * Points going down (an admin correction) is not reported as a gain or a loss.
 */
export function standingChange(prev: Standing | undefined, cur: Standing): { points: number; places: number } | null {
  if (!prev || prev.week !== cur.week) return null;
  const points = Math.max(0, cur.points - prev.points);
  const places = prev.rank !== null && cur.rank !== null ? prev.rank - cur.rank : 0;
  if (points === 0 && places === 0) return null;
  return { points, places };
}
