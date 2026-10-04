// Free (play-token) market routes: YES/NO sheets (market_type event or
// continuous) and majority boards (market_type majority). Shapes captured from
// production on Sep 9 2026. Decimal strings are DB numerics.
import { z } from 'zod';

import { get, post, q } from './client';

const decStr = z.string();

export const FreeMarketType = z.enum(['majority', 'event', 'continuous']);
export type FreeMarketType = z.infer<typeof FreeMarketType>;

export const FreeMarket = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  cover_image_url: z.string().nullable(),
  stream_url: z.string().nullable(),
  status: z.string(),
  lock_time: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  b_parameter: decStr,
  play_tokens: z.number(),
  slug: z.string(),
  is_featured: z.boolean(),
  market_type: FreeMarketType,
  event_start_time: z.string().nullable(),
  resolved_at: z.string().nullable(),
  takeout_pct: decStr,
  floor_multiple: decStr,
  bets_per_user: z.number(),
  seed_per_word: decStr,
  banned_words: z.array(z.string()),
  /**
   * Majority markets: the weight of each paid finishing place. `[3,2,1]` pays
   * the top three; `[1]`, or nothing at all from an older server, is the
   * original winner-takes-all. Read through `placeWeights` in
   * `@/markets/top3`, never directly.
   */
  payout_weights: z.array(z.number()).nullable().optional(),
});
export type FreeMarket = z.infer<typeof FreeMarket>;

export const FreeListEntry = FreeMarket.extend({
  word_count: z.number(),
  trader_count: z.number(),
  words_prices: z.array(
    z.object({
      word_id: z.number(),
      market_id: z.number(),
      word: z.string(),
      yes_price: z.number(),
      no_price: z.number(),
      resolved_outcome: z.boolean().nullable(),
      /** Majority: finishing place once resolved. Tied words share one. */
      place: z.number().nullable().optional(),
    }),
  ),
});
export type FreeListEntry = z.infer<typeof FreeListEntry>;

export const FreeWord = z.object({
  id: z.number(),
  market_id: z.number(),
  word: z.string(),
  resolved_outcome: z.boolean().nullable(),
  mention_threshold: z.number(),
  pending_resolution: z.boolean(),
  added_by: z.string().nullable(),
  mention_count: z.number(),
  seed_tokens: decStr,
  yes_price: z.number(),
  no_price: z.number(),
  yes_qty: z.number(),
  no_qty: z.number(),
});
export type FreeWord = z.infer<typeof FreeWord>;

export const FreeMarketDetail = z.object({ market: FreeMarket, words: z.array(FreeWord), traderCount: z.number() });
export type FreeMarketDetail = z.infer<typeof FreeMarketDetail>;

export const FreePositions = z.object({
  balance: z.number(),
  starting_balance: z.number(),
  positions: z.array(
    z.object({
      word_id: z.number(),
      word: z.string(),
      yes_shares: z.number(),
      no_shares: z.number(),
      tokens_spent: z.number(),
      tokens_received: z.number(),
    }),
  ),
});
export type FreePositions = z.infer<typeof FreePositions>;

export const FreeBoardWord = z.object({
  word_id: z.number(),
  word: z.string(),
  added_by: z.string().nullable(),
  mention_count: z.number(),
  /** On a market that pays places this is true for every placed word, not only the top one. */
  resolved_outcome: z.boolean().nullable(),
  /** Finishing place once resolved. Tied words share one, and the place below a tie is skipped. */
  place: z.number().nullable().optional(),
  pending_resolution: z.boolean(),
  bet_count: z.number(),
  staked: z.number(),
  implied_prob: z.number(),
});
export type FreeBoardWord = z.infer<typeof FreeBoardWord>;

export const FreeBoard = z.object({
  market: FreeMarket,
  board: z.array(FreeBoardWord),
  traderCount: z.number(),
  userEntry: z.array(z.object({ word_id: z.number(), word: z.string(), tokens: z.number(), tokens_received: z.number() })).nullable(),
  hasEntered: z.boolean(),
  balance: z.number().nullable(), // null when no wallet is passed
  recentBets: z.array(
    z.object({
      id: z.number(),
      word_id: z.number(),
      word: z.string(),
      wallet: z.string(),
      username: z.string().nullable(),
      tokens: z.number(),
      is_word_add: z.boolean(),
      pool_after: z.number(),
      word_staked_after: z.number(),
      created_at: z.string(),
    }),
  ),
});
export type FreeBoard = z.infer<typeof FreeBoard>;

export const FreeChart = z.object({
  words: z.array(
    z.object({
      word_id: z.number(),
      word: z.string(),
      history: z.array(z.object({ t: z.string(), yes: z.number(), no: z.number() })),
    }),
  ),
});
export type FreeChart = z.infer<typeof FreeChart>;

export const FreeActivityPosition = z.object({
  id: z.number(),
  market_id: z.number(),
  word_id: z.number(),
  yes_shares: decStr,
  no_shares: decStr,
  tokens_spent: decStr,
  tokens_received: decStr,
  updated_at: z.string(),
  word: z.string(),
  market_title: z.string(),
  market_status: z.string(),
  market_slug: z.string(),
  market_type: FreeMarketType,
});
export type FreeActivityPosition = z.infer<typeof FreeActivityPosition>;

export const FreeActivityTrade = z.object({
  id: z.number(),
  market_id: z.number(),
  word_id: z.number(),
  action: z.string(),
  side: z.enum(['YES', 'NO', 'PICK']), // PICK = free majority entry
  shares: decStr,
  cost: decStr,
  created_at: z.string(),
  word: z.string(),
  market_title: z.string(),
  market_slug: z.string(),
  market_type: FreeMarketType,
});

export const FreeUserActivity = z.object({
  positions: z.array(FreeActivityPosition),
  trades: z.array(FreeActivityTrade),
  pointsEarned: z.number(),
});
export type FreeUserActivity = z.infer<typeof FreeUserActivity>;

export const listFreeMarkets = () => get('/api/custom', z.object({ markets: z.array(FreeListEntry) })).then((r) => r.markets);
export const getFreeMarket = (id: number) => get(`/api/custom/${id}`, FreeMarketDetail);
export const getFreePositions = (id: number, wallet: string) => get(`/api/custom/${id}/positions${q({ wallet })}`, FreePositions);
export const getFreeBoard = (id: number, wallet?: string) => get(`/api/custom/${id}/board${q({ wallet })}`, FreeBoard);
export const getFreeChart = (id: number) => get(`/api/custom/${id}/chart`, FreeChart);
export const getFreeUserActivity = (wallet: string) => get(`/api/custom/user-activity${q({ wallet })}`, FreeUserActivity);

// ── Writes ───────────────────────────────────────────────────────────────────
// Both need the session bearer; the client attaches it. Neither is retried.

const Achievement = z.object({ id: z.string(), emoji: z.string(), title: z.string(), points: z.number() });
export type Achievement = z.infer<typeof Achievement>;

export const FreeTradeResult = z.object({
  trade_id: z.union([z.number(), z.string()]),
  cost: z.number(),
  shares: z.number(),
  new_yes_price: z.number(),
  new_no_price: z.number(),
  new_balance: z.number(),
  new_yes_shares: z.number(),
  new_no_shares: z.number(),
  newAchievements: z.array(Achievement).default([]),
});
export type FreeTradeResult = z.infer<typeof FreeTradeResult>;

/**
 * A free YES/NO trade. Buys are an amount of play tokens (minimum 1), sells an
 * amount of shares, exactly as the website sends them. The website sends no
 * slippage bound, so neither does the app.
 */
export const tradeFree = (
  id: number,
  body: { word_id: number; action: 'buy' | 'sell'; side: 'YES' | 'NO'; amount: number; amount_type: 'tokens' | 'shares' },
) => post(`/api/custom/${id}/trade`, body, FreeTradeResult);

export const FreeEntryResult = z.object({
  picks: z.array(z.unknown()),
  new_balance: z.number(),
  newAchievements: z.array(Achievement).default([]),
});
export type FreeEntryResult = z.infer<typeof FreeEntryResult>;

/** A free majority entry: exactly the market's number of picks, each an existing word or a new one. */
export const enterFreeMajority = (id: number, words: ({ wordId: number } | { newWord: string })[]) =>
  post(`/api/custom/${id}/entry`, { words }, FreeEntryResult);

/**
 * The numeric id behind a free market's slug.
 *
 * Notifications and website links carry the slug ("/free/vikings-packers"),
 * while every app route and API call takes the id, so a tapped link has to be
 * resolved before it can be opened.
 */
export const getFreeMarketIdBySlug = (slug: string) =>
  get(`/api/custom/by-slug/${encodeURIComponent(slug)}`, z.object({ id: z.number() })).then((r) => r.id);
