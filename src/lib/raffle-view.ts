// How the weekly ticket raffle works, as the Ranks screen explains it behind
// its "i". The rules are the website's (specs/weekly_prizepool_spec.md §2 in
// the web repo): tickets are $1 majority words, one weighted draw a week, the
// top 5 placers sit out so six different people win, creators are not entered.
// The share and the amount come from the pool's own split, never a constant.
import { usd } from '@/lib/format';

type SplitRow = { kind: string; pct: number; usd: number };

/** The raffle's slice of the pool, from the prize-pool route's split. */
export function raffleShare(split: SplitRow[] | undefined): { pct: number; usd: number } | null {
  const row = split?.find((s) => s.kind === 'raffle');
  return row ? { pct: row.pct, usd: row.usd } : null;
}

export type RaffleRule = { emoji: string; text: string };

export function raffleRules(share: { pct: number; usd: number } | null, current: boolean): RaffleRule[] {
  const prize = share
    ? `The winner takes ${Math.round(share.pct * 100)}% of the week's prize pool: ${usd(share.usd)}${current ? ' so far, and it grows with every trade' : ''}.`
    : "The winner takes a share of the week's prize pool.";
  return [
    { emoji: '🎟️', text: 'Every $1 word you pick on a majority market is one ticket. More words, more tickets.' },
    { emoji: '🎯', text: 'One winner a week, drawn at random. Each ticket is one chance, so more tickets means better odds.' },
    { emoji: '💰', text: prize },
    { emoji: '🏆', text: 'The top 5 on the points board win a placing prize instead, so their tickets sit out and six different people win. Market creators are not entered.' },
    { emoji: '🗓️', text: 'Weeks run Monday to Sunday, UTC. The draw happens once the week closes, and the prize is paid in USDC.' },
  ];
}
