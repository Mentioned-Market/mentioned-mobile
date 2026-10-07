// Market categories ("Football", "NFL", "Earnings"): the website's one shared
// list. Each market on the three list routes carries a category's slug, or
// null; the name comes from here. Public and cached server side.
import { z } from 'zod';

import { get } from './client';

export const MarketCategory = z.object({
  slug: z.string(),
  name: z.string(),
  sort_order: z.number(),
});
export type MarketCategory = z.infer<typeof MarketCategory>;

export const Categories = z.object({ categories: z.array(MarketCategory) });

export const getCategories = () => get('/api/categories', Categories).then((r) => r.categories);
