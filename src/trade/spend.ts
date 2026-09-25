// The per-position spending cap on paid AMM markets, ported from the website.
//
// The website allows at most $15 of net spend on any one (word, side), and no
// buy under $0.50 (raised from a $2 cap in September 2026). Nothing on chain
// enforces either: the program took
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

/** $15 in USDC base units, matching the website's MAX_POSITION_USDC. */
export const MAX_POSITION_USDC = 15_000_000;

/** $0.50 in USDC base units, matching the website's MIN_BUY_USDC. */
export const MIN_BUY_USDC = 500_000;

const dollars = (units: number) => `$${(units / 1e6).toFixed(2)}`;
/** "$15", the cap as the website labels it. */
export const MAX_POSITION_LABEL = `$${MAX_POSITION_USDC / 1e6}`;

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

/**
 * Full once less than a minimum buy is left, as on the website: room for
 * $0.30 more is room for nothing, since no buy can be that small.
 */
export function isPositionFull(remaining: number): boolean {
  return remaining < MIN_BUY_USDC;
}

/** Why a buy of `units` is not allowed, or null when it is. Both in base units. */
export function buyLimitError(units: number, remaining: number, side: SpendSide): string | null {
  if (units <= 0) return null;
  if (units < MIN_BUY_USDC) return `Minimum buy is ${dollars(MIN_BUY_USDC)}.`;
  if (units > remaining) {
    return isPositionFull(remaining)
      ? `Position full. ${MAX_POSITION_LABEL} is the most on ${side}.`
      : `Max ${MAX_POSITION_LABEL} per position. You can add up to ${dollars(remaining)} more on ${side}.`;
  }
  return null;
}

/** Steps the quick amounts add to what is typed, in base units. */
export const BUY_STEPS = [500_000, 1_000_000, 5_000_000];

const stepLabel = (units: number) => `+$${units / 1e6}`;
const toValue = (units: number) => (units / 1e6).toFixed(2);

/**
 * Quick amounts: +$0.5, +$1 and +$5 add to what is already typed, and Max is
 * everything that can go in, which is the smaller of the wallet's USDC and the
 * room left under the cap. Every value is capped at that same limit and
 * rounded down to the cent, so none can be refused for being too much. Max is
 * left out when it is under the minimum buy, and all of them when the
 * position is full.
 *
 * `typed` and `remaining` are base units; `balance` is the wallet's USDC in
 * base units, or undefined while it loads (Max is then the room left).
 */
export function buyPresets(typed: number, remaining: number, balance?: number): { label: string; value: string }[] {
  if (isPositionFull(remaining)) return [];
  const most = Math.floor(Math.min(remaining, balance ?? remaining) / 10_000) * 10_000;
  const capped = (units: number) => Math.min(units, Math.max(most, MIN_BUY_USDC));
  const presets = BUY_STEPS.map((step) => ({ label: stepLabel(step), value: toValue(capped(Math.max(0, typed) + step)) }));
  return most >= MIN_BUY_USDC ? [...presets, { label: 'Max', value: toValue(most) }] : presets;
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
