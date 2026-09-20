// The website's sidebar feed: the words being traded most right now, across
// every market family. Public and cached server side for five minutes.
import { z } from 'zod';

import { get } from './client';

export const TrendingWord = z.object({
  /**
   * `paid:<marketId>:<wordIndex>`, `paidmaj:<slug>:<word>` or
   * `free:<slug>:<word>`. This, not `href`, is what the app routes on: the
   * href is a website path, and the website addresses paid and majority
   * markets by slug where the app uses ids.
   */
  id: z.string(),
  word: z.string(),
  market_title: z.string(),
  href: z.string(),
  paid: z.boolean(),
  live: z.boolean(),
  trader_count: z.number(),
  trade_count: z.number(),
});
export type TrendingWord = z.infer<typeof TrendingWord>;

const Sidebar = z.object({
  trendingWords: z.array(TrendingWord),
  trendingWindow: z.string().optional(),
});

export const getTrendingWords = () => get('/api/markets/sidebar', Sidebar).then((r) => r.trendingWords);
