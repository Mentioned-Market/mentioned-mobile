// How a resolved paid YES/NO market's leaderboard reads: the signed profit, the
// return on what was put in, and the line under a name. The rows themselves
// come from the website, already scored and sorted by profit
// (/api/paid-markets/market/[id]/results); nothing here re-derives a result.
import { usd } from '@/lib/format';

/**
 * Below half a cent a figure is rounding, not a result, so it reads as flat
 * rather than as a "+$0.00" in green. The website draws the same line.
 */
const FLAT = 0.004;

export type Tone = 'up' | 'down' | 'flat';

export const pnlTone = (n: number): Tone => (n > FLAT ? 'up' : n < -FLAT ? 'down' : 'flat');

/** "+$7.13", "-$1.00", "$0.00". Always cents: a leaderboard compares small sums. */
export function signedUsd(n: number): string {
  const tone = pnlTone(n);
  return `${tone === 'up' ? '+' : tone === 'down' ? '-' : ''}${usd(Math.abs(n), { dp: 2 })}`;
}

/**
 * Profit as a share of what went in, e.g. "+92%". Null when nothing was put
 * in: someone can end with a profit on no net stake by selling for more than
 * they paid, and a percentage of nothing is not a number worth showing.
 */
export function returnPct(profitUsdc: number, stakeUsdc: number): string | null {
  if (stakeUsdc <= FLAT) return null;
  const p = (profitUsdc / stakeUsdc) * 100;
  if (Math.abs(p) < 0.05) return '0%';
  return `${p > 0 ? '+' : ''}${p.toFixed(Math.abs(p) >= 100 ? 0 : 1)}%`;
}

/** The line under a trader's name: "3 words · $7.75 in · 500 pts". */
export function traderLine(row: { words: unknown[]; stakeUsdc: number; points: number }): string {
  const n = row.words.length;
  return [`${n} ${n === 1 ? 'word' : 'words'}`, `${usd(Math.max(0, row.stakeUsdc), { dp: 2 })} in`, row.points > 0 ? `${row.points} pts` : null].filter(Boolean).join(' · ');
}

/** "4 in profit · 9 traders", the line under the list. */
export function resultsSummary(rows: { profitUsdc: number }[]): string {
  const up = rows.filter((r) => pnlTone(r.profitUsdc) === 'up').length;
  return `${up} in profit · ${rows.length} ${rows.length === 1 ? 'trader' : 'traders'}`;
}

/** Rows shown before "Show all": enough for the podium and the chasing pack. */
export const RESULTS_SHOWN = 10;

/**
 * The rows to draw while the list is folded: the first ten, and the viewer's
 * own row with its real rank if it falls below them, so nobody has to unfold
 * the list to find out how they did.
 */
export function foldedRows<T extends { wallet: string }>(rows: T[], viewer: string | null, expanded: boolean): { row: T; rank: number }[] {
  const ranked = rows.map((row, i) => ({ row, rank: i + 1 }));
  if (expanded || rows.length <= RESULTS_SHOWN) return ranked;
  const top = ranked.slice(0, RESULTS_SHOWN);
  const mine = viewer ? ranked.find((r) => r.row.wallet === viewer) : undefined;
  return mine && mine.rank > RESULTS_SHOWN ? [...top, mine] : top;
}
