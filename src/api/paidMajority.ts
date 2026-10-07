// Paid majority market routes (on-chain pari-mutuel, USDC). Shapes captured
// from production on Sep 9 2026. Base-unit amounts arrive as decimal strings.
import { z } from 'zod';

import { get, post, q } from './client';

const numStr = z.string().regex(/^-?\d+$/);

export const PaidMajorityListWord = z.object({
  // Null until the server has resolved the word's text, as on the market route.
  word: z.string().nullable(),
  wordHash: z.string(),
  oddsPct: z.number(),
  outcome: z.number(),
});

/**
 * One step of a resolved top 3 market's podium, priced by the server from the
 * on-chain pots: the place, the word or tied words on it, and what a pick on
 * it paid per dollar staked (0 when nobody backed that place).
 */
export const PaidMajorityPodiumTier = z.object({
  place: z.number(),
  words: z.array(z.string()),
  multiple: z.number(),
});

export const PaidMajorityListEntry = z.object({
  marketId: numStr,
  title: z.string(),
  coverImageUrl: z.string().nullable(),
  status: z.number(),
  slug: z.string().nullable(),
  wordCount: z.number(),
  words: z.array(PaidMajorityListWord),
  poolUsdc: numStr,
  unitPrice: numStr,
  lockTs: numStr,
  eventStartTime: z.string().nullable(),
  traderCount: z.number(),
  isFeatured: z.boolean(),
  /** Category slug (see src/api/categories.ts), or null. Absent on a server from before categories. */
  category: z.string().nullable().optional(),
  /** Present only on a resolved market that pays several places. Best place first. */
  podium: z.array(PaidMajorityPodiumTier).nullable().optional(),
});
export type PaidMajorityListEntry = z.infer<typeof PaidMajorityListEntry>;

export const PaidMajorityMarket = z.object({
  // Null when there is no such market on chain.
  account: z.string().nullable(),
  vaultAmount: numStr,
  board: z.array(
    z.object({
      wordHash: z.string(),
      // Null until the server knows the text behind the hash: a word is
      // identified on chain only by its hash, and the text arrives from the
      // buyer's record call or the indexer. Requiring text here meant one such
      // word failed the whole market screen for every mobile user.
      word: z.string().nullable(),
      units: numStr,
      oddsPct: z.number(),
      outcome: z.number(),
      /** 1 to 3 once resolved on a market that pays places, else 0. Absent from a server that predates top 3. */
      place: z.number().optional(),
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
  slug: z.string().nullable(),
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
  /** The word's finishing place, as on the market route. */
  place: z.number().optional(),
});

export const PaidMajorityUserPosition = z.object({
  marketId: numStr,
  title: z.string(),
  slug: z.string().nullable(),
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

/**
 * Tell the web about a confirmed majority buy, so the feed, leaderboard and
 * points see it without waiting for an indexer. Deduplicated server side by
 * signature. Sent with the bearer, which is what lets the server award the
 * Plus One achievement: it only does so when the session wallet matches.
 */
export const recordMajorityBuys = (body: {
  marketId: string;
  wallet: string;
  signature: string;
  words: { word: string; isNewWord: boolean }[];
}) => post('/api/paid-majority/record-buys', body, z.object({ ok: z.boolean() }).passthrough());
