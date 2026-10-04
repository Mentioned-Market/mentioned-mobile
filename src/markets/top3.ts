// Majority markets that pay the top three words (docs/MM_V2_SPEC.md).
//
// A majority market used to pay only the most-said word. A market can now pay
// the three most-said words from one pool, weighted 3 / 2 / 1 by finishing
// place. It is a per-market setting, and most markets are still winner takes
// all, so everything here starts from one question: does this market pay
// places? When it does not, every caller keeps the code path it had.
//
// The maths is the website's, in the ported `@/chain/majorityWords` (free) and
// `@/chain/majority` (paid). This module is the app's side of it: which
// formula a market gets, the wording, and the shape the podium draws from.
import type { FreeBoard } from '@/api/free';
import { winnerPayoutBaseUnits, WordOutcome, type PayoutTerms } from '@/chain/majority';
import { firstPlaceMultiple, payoutWeightsOf, placeLabel, potentialWin, tieredMultiples } from '@/chain/majorityWords';
import { tokens, usd } from '@/lib/format';

// ── Is this a top 3 market? ──────────────────────────────────────────────────

/** A free market's weights: `[3,2,1]`, or `[1]` for winner takes all and for a server that sends none. */
export const freeWeights = (raw: unknown): number[] => payoutWeightsOf(raw);

/**
 * A paid market's weights as a list of its paid places. The account stores
 * three bytes: `[0,0,0]` (a market from before the upgrade) and `[n,0,0]` are
 * both winner takes all.
 */
export function paidWeights(stored: readonly number[] | null | undefined): number[] {
  const paid = (stored ?? []).filter((w) => w > 0);
  return paid.length > 0 ? paid : [1];
}

/** True when more than one finishing place pays. */
export const paysPlaces = (weights: readonly number[]): boolean => weights.length > 1;

// ── While the market is open ─────────────────────────────────────────────────

export type PoolState = {
  weights: readonly number[];
  /** Everything staked, in the market's own unit (tokens, or paid units). */
  pool: number;
  /** Each word's stake, in the same unit. */
  stakes: readonly number[];
  /** Fee as a fraction: free `takeout_pct`, paid `fee_bps / 10000`. */
  fee: number;
  /** The guaranteed 1st-place multiple. Free markets only; 0 for paid. */
  floor: number;
};

/**
 * What a fresh pick of `bet` on the word at `index` pays if that word wins
 * (`index` -1 for a word not on the board yet).
 *
 * Winner takes all: the pick's share of the pool, the figure the app always
 * showed. Top 3: the podium is unknown until the event ends, so this is the
 * least the pick pays if its word finishes 1st, assuming the most-backed
 * rivals take the other places. That shares the pool the most ways, so the
 * real payout is this or more.
 */
export function freshPickWin(state: PoolState, index: number, bet: number): number {
  const wordStake = index >= 0 ? (state.stakes[index] ?? 0) : 0;
  if (!paysPlaces(state.weights)) return potentialWin(wordStake, state.pool, bet, state.fee, state.floor);
  const rivals = state.stakes.filter((_, i) => i !== index);
  return bet * firstPlaceMultiple(state.pool + bet, wordStake + bet, rivals, state.fee, state.floor, state.weights);
}

/** The same estimate for a pick already placed: the pool and the word's stake as they stand. */
export function heldPickWin(state: PoolState, index: number, stake: number): number {
  const wordStake = state.stakes[index] ?? 0;
  const rivals = state.stakes.filter((_, i) => i !== index);
  return stake * firstPlaceMultiple(state.pool, wordStake, rivals, state.fee, state.floor, state.weights);
}

/** The line under a word while it is selected, and on the ticket. */
export function winLine(places: boolean, amount: string): string {
  return places ? `If 1st, at least ${amount}` : `Wins ${amount} if said most`;
}

/** What the board is asking for. */
export function boardTitle(places: boolean, open: boolean, paidPlaces = 3): string {
  if (!open) return 'Board';
  return places ? `Pick the ${paidPlaces} words said the most` : 'Pick the word said the most';
}

/** The note on the ticket before a pick is confirmed. */
export function ticketNote(paidPlaces: number): string {
  return `The ${paidPlaces} most-said words all pay from one pool: 1st pays the most, then each place below it. More than one of your picks can pay. Odds move as more picks land.`;
}

// ── Once resolved: the podium ────────────────────────────────────────────────

export type PodiumWord = {
  key: string;
  word: string;
  /** Free markets know how often each word was said; paid ones do not. */
  mentions?: number;
};

/** One step: a finishing place, the word or tied words on it, and what it paid. */
export type PodiumTier = {
  place: number;
  words: PodiumWord[];
  /** What a pick on this place paid per unit staked. 0 means nobody backed it. */
  multiple: number;
};

/** Nothing to draw when no place was called, or when nobody had picked any placed word. */
function drawable(tiers: PodiumTier[]): PodiumTier[] | null {
  return tiers.length > 0 && tiers.some((t) => t.multiple > 0) ? tiers : null;
}

function byPlace<T extends { place?: number | null }>(words: readonly T[]): [number, T[]][] {
  const grouped = new Map<number, T[]>();
  for (const w of words) {
    if (w.place == null || w.place < 1) continue;
    grouped.set(w.place, [...(grouped.get(w.place) ?? []), w]);
  }
  return [...grouped.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * A free market's podium, worked out from the resolved board with the same
 * division the settlement ran. `staked` only has to be in proportion, so the
 * list route's pool shares work as well as the board's token counts.
 */
export function freePodium(
  board: readonly { key: string; word: string; place?: number | null; staked: number; mentions?: number }[],
  weights: readonly number[],
  fee: number,
  floor: number,
): PodiumTier[] | null {
  const groups = byPlace(board);
  const multiples = tieredMultiples(
    board.reduce((s, w) => s + w.staked, 0),
    groups.map(([, ws]) => ({ words: ws.length, staked: ws.reduce((s, w) => s + w.staked, 0) })),
    fee,
    floor,
    weights,
  );
  return drawable(
    groups.map(([place, ws], i) => ({
      place,
      words: ws.map((w) => ({ key: w.key, word: w.word, ...(w.mentions === undefined ? {} : { mentions: w.mentions }) })),
      multiple: multiples[i] ?? 0,
    })),
  );
}

/** What the paid podium needs from the market account. */
export type PaidPots = { placePot: readonly bigint[]; placeUnits: readonly bigint[]; unitPrice: bigint };

/**
 * A paid market's podium, priced from the pots the program set aside at
 * resolve: a place paid `pot / (units * unit price)` per dollar staked.
 */
export function paidPodium(board: readonly { key: string; word: string; place?: number | null }[], pots: PaidPots): PodiumTier[] | null {
  return drawable(
    byPlace(board).map(([place, ws]) => {
      const staked = Number(pots.placeUnits[place - 1] ?? 0n) * Number(pots.unitPrice);
      return {
        place,
        words: ws.map((w) => ({ key: w.key, word: w.word })),
        multiple: staked > 0 ? Number(pots.placePot[place - 1] ?? 0n) / staked : 0,
      };
    }),
  );
}

/** The paid list route's podium, which arrives already priced. */
export function listPodium(tiers: readonly { place: number; words: readonly string[]; multiple: number }[] | null | undefined): PodiumTier[] | null {
  return drawable(
    [...(tiers ?? [])]
      .sort((a, b) => a.place - b.place)
      .map((t) => ({ place: t.place, words: t.words.map((word) => ({ key: word, word })), multiple: t.multiple })),
  );
}

/**
 * The steps left to right. A podium reads 1st, 2nd, 3rd but stands 2nd, 1st,
 * 3rd, with the winner in the middle. A missing place is simply not there: a
 * tie for 1st followed by 3rd is two steps.
 */
export function standingOrder(tiers: readonly PodiumTier[]): PodiumTier[] {
  const slot = (t: PodiumTier) => (t.place === 1 ? 2 : t.place === 2 ? 1 : t.place);
  return [...tiers].sort((a, b) => slot(a) - slot(b));
}

/** "pays 2.81x", or "no picks" for a place nobody backed. `bare` drops the verb, for the small card. */
export function paysText(multiple: number, bare = false): string {
  if (multiple <= 0) return 'no picks';
  return bare ? `${multiple.toFixed(2)}x` : `pays ${multiple.toFixed(2)}x`;
}

/** The headline: the 1st-place word, or the tied words joined. */
export function podiumHeadline(tiers: readonly PodiumTier[]): string {
  return (tiers[0]?.words ?? []).map((w) => w.word).join(' & ');
}

/** "Said the most, 11 times. The top 3 share the pool." */
export function podiumSubline(tiers: readonly PodiumTier[], paidPlaces: number): string {
  const first = tiers[0];
  const tied = (first?.words.length ?? 0) > 1;
  const mentions = first?.words[0]?.mentions;
  const said =
    mentions === undefined
      ? tied
        ? 'Tied for the most said.'
        : 'Said the most.'
      : tied
        ? `Tied for the most said, ${mentions} ${mentions === 1 ? 'time' : 'times'} each.`
        : `Said the most, ${mentions} ${mentions === 1 ? 'time' : 'times'}.`;
  return `${said} The top ${paidPlaces} share the pool.`;
}

/** The result in one line, for a screen that does not draw the podium: "1st america · 2nd china · 3rd wolf". */
export function placesLine(tiers: readonly PodiumTier[]): string {
  return tiers.map((t) => `${placeLabel(t.place)} ${t.words.map((w) => w.word).join(' & ')}`).join(' · ');
}

/** "11 mentions", or "Tied · 14 mentions" on a shared step. Null when the count is not known. */
export function mentionsText(tier: PodiumTier): string | null {
  const n = tier.words[0]?.mentions;
  if (n === undefined) return null;
  return `${tier.words.length > 1 ? 'Tied · ' : ''}${n} ${n === 1 ? 'mention' : 'mentions'}`;
}

/** Delay before a step rises: the lowest step first and the winner last. */
export const stepDelayMs = (place: number) => Math.max(0, 3 - place) * 120;

// ── Once resolved: the viewer's own picks ───────────────────────────────────

/** One of the viewer's picks on a resolved market, in the market's unit (tokens or dollars). */
export type ResolvedPick = { key: string; word: string; place: number | null; stake: number; payout: number };

export type PickResult = {
  key: string;
  word: string;
  /** "1st", "2nd", "3rd", or null for a word that did not place. */
  placeText: string | null;
  net: number;
};

export function pickResults(picks: readonly ResolvedPick[]): { rows: PickResult[]; net: number } {
  const rows = picks.map((p) => ({
    key: p.key,
    word: p.word,
    placeText: p.place && p.place >= 1 ? placeLabel(p.place) : null,
    net: p.payout - p.stake,
  }));
  return { rows, net: rows.reduce((s, r) => s + r.net, 0) };
}

/** "+369" in tokens, "+$1.35" or "-$1.00" in dollars. Zero reads as a gain of nothing. */
export function netText(net: number, unit: 'tokens' | 'usd'): string {
  const sign = net < 0 ? '-' : '+';
  return unit === 'usd' ? `${sign}${usd(Math.abs(net), { dp: 2 })}` : `${sign}${tokens(Math.abs(Math.round(net)))}`;
}

/** "Finished 2nd" or "Did not place", for a market that pays places. */
export const finishText = (placeText: string | null) => (placeText ? `Finished ${placeText}` : 'Did not place');

/**
 * What a paid position is worth once its market has resolved, in USDC base
 * units. The one place the app prices a paid majority payout itself: a placed
 * word pays from its place's own pot, a winner on a market that pays one place
 * pays from the whole pool, a word being refunded returns the exact stake, and
 * anything else pays nothing. The program's `claim` makes the same choice.
 */
export function paidPositionPayout(units: bigint, outcome: number, place: number, terms: PayoutTerms & { unitPrice: bigint }): bigint {
  if (outcome === WordOutcome.Winner) return winnerPayoutBaseUnits(units, place, terms);
  if (outcome === WordOutcome.Refunding) return units * terms.unitPrice;
  return 0n;
}

// ── A resolved market, whole: its podium and the viewer's picks on it ───────
// What the market screen and the results screen both draw from, so the two
// cannot disagree about a result.

export type MarketResult = {
  /** Null on a market that pays one winner, and while there is nothing to draw yet. */
  podium: PodiumTier[] | null;
  /** The viewer's picks with how each finished. Empty without a podium. */
  picks: ResolvedPick[];
};

const NO_RESULT: MarketResult = { podium: null, picks: [] };

/** A free majority market's result, from its board. `resolved` is the screen's own reading of the status. */
export function freeResult(d: Pick<FreeBoard, 'market' | 'board' | 'userEntry'>, resolved: boolean): MarketResult {
  const weights = freeWeights(d.market.payout_weights);
  if (!resolved || !paysPlaces(weights)) return NO_RESULT;
  const podium = freePodium(
    // Mention counts are left out on purpose. The resolution flow does not
    // record them yet, so the board's `mention_count` is not what decided the
    // places, and a podium saying "11 mentions" under a word that another
    // out-counts would contradict its own result. Pass `mentions` here once
    // the count comes from the resolve itself; the podium already draws it.
    d.board.map((w) => ({ key: String(w.word_id), word: w.word, place: w.place, staked: w.staked })),
    weights,
    Number(d.market.takeout_pct) || 0,
    Number(d.market.floor_multiple) || 0,
  );
  if (!podium) return NO_RESULT;
  const placeOf = new Map(d.board.map((w) => [w.word_id, w.place ?? null]));
  return {
    podium,
    picks: (d.userEntry ?? []).map((e) => ({
      key: String(e.word_id),
      word: e.word,
      place: placeOf.get(e.word_id) ?? null,
      stake: e.tokens,
      payout: e.tokens_received,
    })),
  };
}

/** What a paid result needs from the decoded market account. */
export type PaidAccount = PayoutTerms & PaidPots & { payoutWeights: readonly number[] };

/**
 * A paid majority market's result, in dollars. The board gives each word its
 * place, the account gives the pots, and the viewer's positions are priced
 * with the same formula the program's `claim` pays by. A position's own
 * `place` is used when the route sends it, the board's otherwise.
 */
export function paidResult(
  board: readonly { wordHash: string; word: string | null; place?: number }[],
  positions: readonly { wordHash: string; word: string; units: string; outcome: number; place?: number }[],
  acct: PaidAccount,
  resolved: boolean,
): MarketResult {
  if (!resolved || !paysPlaces(paidWeights(acct.payoutWeights))) return NO_RESULT;
  const podium = paidPodium(
    board.filter((b): b is typeof b & { word: string } => b.word !== null).map((b) => ({ key: b.wordHash, word: b.word, place: b.place })),
    acct,
  );
  if (!podium) return NO_RESULT;
  const placeOf = new Map(board.map((b) => [b.wordHash, b.place ?? 0]));
  const unitUsd = Number(acct.unitPrice) / 1e6;
  return {
    podium,
    picks: positions.map((p) => {
      const place = p.place ?? placeOf.get(p.wordHash) ?? 0;
      const units = BigInt(p.units);
      return {
        key: p.wordHash,
        word: p.word,
        place: place >= 1 ? place : null,
        stake: Number(units) * unitUsd,
        payout: Number(paidPositionPayout(units, p.outcome, place, acct)) / 1e6,
      };
    }),
  };
}
