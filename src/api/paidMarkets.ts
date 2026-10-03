// Paid YES/NO (LMSR AMM, USDC) routes. Shapes captured from production on
// Sep 9 2026. The market account is raw base64, decoded on device with
// deserializeMarketAccount from src/chain/amm.
import { z } from 'zod';

import { get, q } from './client';

const numStr = z.string().regex(/^-?\d+$/);

export const PaidMarketListWord = z.object({
  label: z.string(),
  yesPrice: z.number(),
  noPrice: z.number(),
  outcome: z.boolean().nullable(),
});

export const PaidMarketListEntry = z.object({
  marketId: numStr,
  title: z.string(),
  coverImageUrl: z.string().nullable(),
  status: z.number(),
  // Null when the market's metadata row has no slug yet (the column is
  // nullable on the website). One such market used to fail the whole list.
  slug: z.string().nullable(),
  wordCount: z.number(),
  words: z.array(PaidMarketListWord),
  locksAt: numStr,
  eventStartTime: z.string().nullable(),
  traderCount: z.number(),
  isFeatured: z.boolean(),
});
export type PaidMarketListEntry = z.infer<typeof PaidMarketListEntry>;

export const PaidMarketAccount = z.object({ account: z.string(), vaultAmount: numStr });

export const PaidMarketMetadata = z.object({
  market_id: numStr,
  title: z.string(),
  description: z.string().nullable(),
  cover_image_url: z.string().nullable(),
  stream_url: z.string().nullable(),
  slug: z.string().nullable(),
  event_start_time: z.string().nullable(),
  cluster: z.string(),
  hidden: z.boolean(),
  is_featured: z.boolean(),
});
export type PaidMarketMetadata = z.infer<typeof PaidMarketMetadata>;

export const PaidMarketChart = z.object({
  words: z.array(z.object({ wordIndex: z.number(), history: z.array(z.object({ t: z.number(), p: z.number() })) })),
  totalVolume: z.number(),
});
export type PaidMarketChart = z.infer<typeof PaidMarketChart>;

export const PaidMarketTrade = z.object({
  signature: z.string(),
  wordIndex: z.number(),
  direction: z.enum(['YES', 'NO']),
  isBuy: z.boolean(),
  quantity: z.number(),
  cost: z.number(),
  impliedPrice: z.number(),
  trader: z.string(),
  username: z.string().nullable(),
  blockTime: z.string(),
});
export type PaidMarketTrade = z.infer<typeof PaidMarketTrade>;

export const PaidMarketUserPosition = z.object({
  marketId: numStr,
  marketTitle: z.string(),
  marketStatus: z.number(),
  coverImageUrl: z.string().nullable(),
  wordIndex: z.number(),
  wordLabel: z.string(),
  yesShares: numStr,
  noShares: numStr,
  yesPrice: z.number(),
  noPrice: z.number(),
  outcome: z.boolean().nullable(),
  estValueUsdc: numStr,
  costBasisUsdc: numStr,
});
export type PaidMarketUserPosition = z.infer<typeof PaidMarketUserPosition>;

export const listPaidMarkets = () =>
  get('/api/paid-markets/list', z.object({ markets: z.array(PaidMarketListEntry) })).then((r) => r.markets);

export const getPaidMarket = (id: string) => get(`/api/paid-markets/market/${id}`, PaidMarketAccount);

export const getPaidMarketMetadata = (id: string) => get(`/api/paid-markets/metadata${q({ id })}`, PaidMarketMetadata);

export const getPaidMarketChart = (id: string) => get(`/api/paid-markets/chart${q({ id })}`, PaidMarketChart);

export const getPaidMarketTrades = (id: string) =>
  get(`/api/paid-markets/trades${q({ id })}`, z.object({ trades: z.array(PaidMarketTrade) })).then((r) => r.trades);

export const getPaidMarketUserPositions = (wallet: string) =>
  get(`/api/paid-markets/user-positions${q({ wallet })}`, z.object({ positions: z.array(PaidMarketUserPosition) })).then(
    (r) => r.positions,
  );

/**
 * Net USDC spent by a wallet on each (word, side) of a market, in base units,
 * keyed "<wordIndex>:<0 for YES | 1 for NO>". Buys add, sells subtract.
 *
 * Read from the indexer, so it trails the chain. The trade screen combines it
 * with this session's own trades (src/trade/spend.ts) for that reason.
 */
export const PaidMarketWordSpend = z.object({ spend: z.record(z.string(), z.number()) });
export type PaidMarketWordSpend = z.infer<typeof PaidMarketWordSpend>;

export const getPaidMarketWordSpend = (wallet: string, id: string) =>
  get(`/api/paid-markets/user-word-spend${q({ wallet, id })}`, PaidMarketWordSpend).then((r) => r.spend);
