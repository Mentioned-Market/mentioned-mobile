// The trade ticker: the last fifty trades across every market family, the
// same feed the website's ticker scrolls. Public, cached server side.
import { z } from 'zod';

import { get } from './client';

export const RecentTrade = z.object({
  id: z.string(),
  wallet: z.string(),
  username: z.string().nullable(),
  marketId: z.string(),
  isYes: z.boolean(),
  isBuy: z.boolean(),
  /** Paid families: USDC base units as a string. Free: "0". */
  amountUsd: z.string(),
  marketTitle: z.string().nullable(),
  createdAt: z.string(),
  type: z.enum(['polymarket', 'free', 'paid', 'majority']),
  wordLabel: z.string().nullable().optional(),
  /** Free: play tokens, as a numeric string. */
  cost: z.union([z.string(), z.number()]).nullable().optional(),
  slug: z.string().nullable().optional(),
});
export type RecentTrade = z.infer<typeof RecentTrade>;

export const getRecentTrades = () => get('/api/trades/recent', z.array(RecentTrade));
