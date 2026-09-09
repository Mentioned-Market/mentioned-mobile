// Free (play-token) market routes: YES/NO sheets (market_type event or
// continuous) and majority boards (market_type majority). Shapes captured from
// production on Sep 9 2026. Decimal strings are DB numerics.
import { z } from 'zod';

import { get, q } from './client';

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
  resolved_outcome: z.boolean().nullable(),
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
