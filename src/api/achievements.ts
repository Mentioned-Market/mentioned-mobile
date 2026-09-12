// Achievements, which on Mentioned are also the emoji picker: the profile
// route only accepts an emoji belonging to an achievement the wallet has
// unlocked, so this list is what the picker is allowed to offer.
//
// The set rotates weekly on the web, so the app never hard-codes it.
import { z } from 'zod';

import { get, q } from './client';

export const Achievement = z.object({
  id: z.string(),
  emoji: z.string(),
  title: z.string(),
  description: z.string(),
  points: z.number(),
  unlocked: z.boolean(),
  unlockedAt: z.string().nullable(),
});
export type Achievement = z.infer<typeof Achievement>;

/** Public: every achievement, each marked unlocked or not for this wallet. */
export const listAchievements = (wallet: string) =>
  get(`/api/achievements${q({ wallet })}`, z.object({ achievements: z.array(Achievement) })).then((r) => r.achievements);
