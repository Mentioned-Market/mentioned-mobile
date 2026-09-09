// Result routes: settled leaderboards for paid majority and free markets.
// Paid YES/NO has no results route; its result screen reads the decoded
// account (word outcomes) plus chart volume and trades. Shapes from Sep 9 2026.
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
export const getFreeResults = (id: number) => get(`/api/custom/${id}/results`, FreeResults);
