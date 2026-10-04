// Result routes: settled leaderboards for paid majority, paid YES/NO and free
// markets. Shapes from Sep 9 2026; the paid YES/NO route was added on the
// website later and captured Oct 4 2026.
import { z } from 'zod';

import { get } from './client';

export const PaidMajorityResultRow = z.object({
  wallet: z.string(),
  username: z.string().nullable(),
  pfpEmoji: z.string().nullable(),
  stakeUsdc: z.number(),
  payoutUsdc: z.number(),
  profitUsdc: z.number(),
  points: z.number(),
});
export type PaidMajorityResultRow = z.infer<typeof PaidMajorityResultRow>;

export const PaidMajorityResults = z.object({ resolved: z.boolean(), leaderboard: z.array(PaidMajorityResultRow) });
export type PaidMajorityResults = z.infer<typeof PaidMajorityResults>;

/** One word a trader held in a resolved paid YES/NO market, and how it came out. */
export const PaidMarketResultWord = z.object({
  wordIndex: z.number(),
  label: z.string(),
  side: z.enum(['YES', 'NO']),
  won: z.boolean(),
  costUsdc: z.number(),
  payoutUsdc: z.number(),
  pnlUsdc: z.number(),
});
export type PaidMarketResultWord = z.infer<typeof PaidMarketResultWord>;

export const PaidMarketResultRow = PaidMajorityResultRow.extend({ words: z.array(PaidMarketResultWord) });
export type PaidMarketResultRow = z.infer<typeof PaidMarketResultRow>;

/** `resolved` is false, with no rows, until every word in the market has an outcome. */
export const PaidMarketResults = z.object({ resolved: z.boolean(), leaderboard: z.array(PaidMarketResultRow) });
export type PaidMarketResults = z.infer<typeof PaidMarketResults>;

export const FreeResultWord = z.object({
  word_id: z.number(),
  word: z.string(),
  outcome: z.string().nullable(),
  yes_shares: z.number(),
  no_shares: z.number(),
  tokens_spent: z.number(),
  tokens_received: z.number(),
  net_tokens: z.number(),
});

export const FreeResultRow = z.object({
  wallet: z.string(),
  username: z.string().nullable(),
  pfp_emoji: z.string().nullable(),
  total_spent: z.number(),
  total_received: z.number(),
  net_tokens: z.number(),
  pnl_pct: z.number().nullable(),
  points_earned: z.number(),
  words: z.array(FreeResultWord),
});
export type FreeResultRow = z.infer<typeof FreeResultRow>;

export const FreeResults = z.object({ leaderboard: z.array(FreeResultRow) });
export type FreeResults = z.infer<typeof FreeResults>;

export const getPaidMajorityResults = (id: string) => get(`/api/paid-majority/${id}/results`, PaidMajorityResults);
export const getPaidMarketResults = (id: string) => get(`/api/paid-markets/market/${id}/results`, PaidMarketResults);
export const getFreeResults = (id: number) => get(`/api/custom/${id}/results`, FreeResults);
