// "Your picks" on Home: the markets a wallet has open positions in, soonest to
// close first, each with how long it has left.
//
// Positions do not carry a lock time, and majority positions carry no cover,
// so both come from the market list Home already holds.
import { closesIn } from '@/lib/time';
import { isPaid, type MarketSummary } from '@/markets/merge';
import type { MarketGroup } from '@/markets/positions';

export type HomePick = {
  key: string;
  href: string;
  title: string;
  cover: string | null;
  /** Real money, which decides the placeholder when there is no cover. */
  paid: boolean;
  /** The market's total, e.g. "$3.00 at stake". */
  value: string;
  /** "Closes 3h 12m", "Awaiting result" once locked, or null if unknown. */
  when: string | null;
  /** Still open for picks, so `when` is a countdown worth drawing the eye to. */
  closing: boolean;
  /** For a live countdown on the row; `when` is as of `now`. */
  lockAt: number | null;
};

/** The key a position group uses for its market (see `src/markets/positions.ts`). */
export function marketKeyOf(m: Pick<MarketSummary, 'kind' | 'id'>): string {
  const prefix = m.kind === 'paid-majority' ? 'pm' : m.kind === 'paid-yesno' ? 'pa' : 'fr';
  return `${prefix}:${m.id}`;
}

/**
 * Open groups joined to their markets, soonest lock first. A market missing
 * from the list (a list that failed to load, or one the list no longer
 * carries) still shows, after the dated ones, rather than hiding a position.
 */
export function homePicks(open: MarketGroup[], markets: MarketSummary[], now: number, limit = 3): { picks: HomePick[]; total: number } {
  const byKey = new Map(markets.map((m) => [marketKeyOf(m), m]));
  const joined = open
    .filter((g) => !g.finished)
    .map((g) => {
      const m = byKey.get(g.key);
      const lockAt = m?.lockAt ?? null;
      const countdown = closesIn(lockAt, now);
      const when = lockAt === null ? null : (countdown ?? 'Awaiting result');
      return { lockAt, pick: { key: g.key, href: g.href, title: g.title, cover: g.cover ?? m?.cover ?? null, paid: isPaid(g), value: g.value, when, closing: countdown !== null, lockAt } };
    });
  joined.sort((a, b) => (a.lockAt ?? Infinity) - (b.lockAt ?? Infinity));
  return { picks: joined.slice(0, limit).map((j) => j.pick), total: joined.length };
}
