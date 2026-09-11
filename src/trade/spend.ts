// The per-position spending cap on paid AMM markets, ported from the website.
//
// While paid markets are in early testing the website allows at most $2 of net
// spend on any one (word, side). Nothing on chain enforces it: the program took
// a $293 buy from this app before this file existed. So the app enforces the
// same limit the website does, the same way, or a mobile user could do what a
// web user cannot.
//
// Net spend is buys minus sells, not the value held, so price drift cannot open
// up room under the cap, and selling re-opens it by design.
//
// THE COUNTING PROBLEM. The server figure comes from the indexer, which trails
// the chain by seconds on production and indefinitely on a dev deployment with
// no webhook. So this session's trades are also tracked locally. Adding the two
// would double count a trade the moment the indexer catches up; taking only the
// server figure would forget a trade until it does. Instead the server figure
// is remembered at the moment of this session's first trade on a position, and
// the effective spend is the larger of "what the server says now" and "what it
// said then plus everything since". Both are right when the indexer has caught
// up, and the second is right when it has not.
import { create } from 'zustand';

/** $2 in USDC base units, matching the website's MAX_POSITION_USDC. */
export const MAX_POSITION_USDC = 2_000_000;

export type SpendEntry = {
  /** The server's figure when this session first traded the position. */
  baseline: number;
  /** Net spend from this session's own confirmed trades since then. */
  session: number;
};

export type SpendSide = 'YES' | 'NO';

/** The route's key: "<wordIndex>:<0 for YES | 1 for NO>". */
export function spendKey(wordIndex: number, side: SpendSide): string {
  return `${wordIndex}:${side === 'YES' ? 0 : 1}`;
}

/** Net spend that counts toward the cap, in base units. See the counting problem above. */
export function effectiveSpend(server: number | undefined, entry: SpendEntry | undefined): number {
  const fromServer = server ?? 0;
  if (!entry) return fromServer;
  return Math.max(fromServer, entry.baseline + entry.session);
}

/** How much more can go into the position, in base units. Never negative. */
export function remainingAllowance(spent: number, cap: number = MAX_POSITION_USDC): number {
  return Math.max(0, Math.min(cap, cap - spent));
}

type SessionSpendState = {
  entries: Record<string, SpendEntry>;
  /**
   * Record a confirmed trade. `delta` is base units: the all-in cost of a buy,
   * or minus the net return of a sell. `serverNow` is the indexed figure at the
   * time, which becomes the baseline on the first trade of the position.
   */
  record: (marketId: string, key: string, delta: number, serverNow: number | undefined) => void;
};

/**
 * This session's trades, in memory only. Not persisted on purpose: after a
 * restart the indexer has usually caught up, and a stale local figure that
 * outlived its trades would block a user from a position they are allowed.
 */
export const useSessionSpend = create<SessionSpendState>((set) => ({
  entries: {},
  record: (marketId, key, delta, serverNow) =>
    set((state) => {
      const id = `${marketId}:${key}`;
      const prev = state.entries[id] ?? { baseline: serverNow ?? 0, session: 0 };
      return { entries: { ...state.entries, [id]: { baseline: prev.baseline, session: prev.session + delta } } };
    }),
}));
