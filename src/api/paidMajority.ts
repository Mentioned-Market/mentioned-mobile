// Paid majority market routes (on-chain pari-mutuel, USDC). Shapes captured
// from production on Sep 9 2026. Base-unit amounts arrive as decimal strings.
import { z } from 'zod';

import { get, q } from './client';

const numStr = z.string().regex(/^-?\d+$/);

export const PaidMajorityListWord = z.object({
  word: z.string(),
  wordHash: z.string(),
  oddsPct: z.number(),
  outcome: z.number(),
});

export const PaidMajorityListEntry = z.object({
  marketId: numStr,
  title: z.string(),
  coverImageUrl: z.string().nullable(),
  status: z.number(),
  slug: z.string(),
  wordCount: z.number(),
  words: z.array(PaidMajorityListWord),
  poolUsdc: numStr,
  unitPrice: numStr,
  lockTs: numStr,
  eventStartTime: z.string().nullable(),
  traderCount: z.number(),
  isFeatured: z.boolean(),
});
export type PaidMajorityListEntry = z.infer<typeof PaidMajorityListEntry>;

export const PaidMajorityMarket = z.object({
  account: z.string(),
  vaultAmount: numStr,
  board: z.array(
    z.object({
      wordHash: z.string(),
      word: z.string(),
      units: numStr,
      oddsPct: z.number(),
      outcome: z.number(),
    }),
  ),
  totalUnits: numStr,
  traderCount: z.number(),
});
export type PaidMajorityMarket = z.infer<typeof PaidMajorityMarket>;

export const PaidMajorityMetadata = z.object({
  market_id: numStr,
  cluster: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  cover_image_url: z.string().nullable(),
  stream_url: z.string().nullable(),
  slug: z.string(),
  event_start_time: z.string().nullable(),
  unit_price: numStr,
  lock_ts: numStr,
  hidden: z.boolean(),
  is_featured: z.boolean(),
  banned_words: z.array(z.string()),
});
export type PaidMajorityMetadata = z.infer<typeof PaidMajorityMetadata>;

export const PaidMajorityPosition = z.object({
  wordHash: z.string(),
  word: z.string(),
  units: numStr,
  outcome: z.number(),
});

export const PaidMajorityUserPosition = z.object({
  marketId: numStr,
  title: z.string(),
  slug: z.string(),
  status: z.number(),
  word: z.string(),
  wordHash: z.string(),
  units: numStr,
  stakeUsdc: z.number(),
  claimableUsdc: z.number(),
  refundable: z.boolean(),
});
export type PaidMajorityUserPosition = z.infer<typeof PaidMajorityUserPosition>;

export const listPaidMajority = () =>
  get('/api/paid-majority/list', z.object({ markets: z.array(PaidMajorityListEntry) })).then((r) => r.markets);

export const getPaidMajorityMarket = (id: string) => get(`/api/paid-majority/market/${id}`, PaidMajorityMarket);

export const getPaidMajorityMetadata = () => get('/api/paid-majority/metadata', z.array(PaidMajorityMetadata));

export const getPaidMajorityPositions = (id: string, wallet: string) =>
  get(`/api/paid-majority/my-positions${q({ id, wallet })}`, z.object({ positions: z.array(PaidMajorityPosition) })).then(
    (r) => r.positions,
  );

export const getPaidMajorityUserPositions = (wallet: string) =>
  get(`/api/paid-majority/user-positions${q({ wallet })}`, z.object({ positions: z.array(PaidMajorityUserPosition) })).then(
    (r) => r.positions,
  );
