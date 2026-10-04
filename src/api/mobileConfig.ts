// What the server says this build of the app may do right now: the minimum
// version it still supports, a kill switch, and per-feature flags.
//
// Everything is optional on purpose. The route is static JSON from environment
// variables on the web, and an environment that sets none of them, or a server
// that predates the route entirely, must leave the app fully working rather than
// locked. A missing route (404) is read as "no rules", not as a failure.
import { z } from 'zod';

import { ApiError, get } from './client';

export const MobileConfig = z.object({
  /** Oldest app version still allowed, e.g. "0.2.0". Below it the app asks for an update. */
  minVersion: z.string().nullable().optional(),
  /** When true the app shows a maintenance screen instead of itself. */
  killSwitch: z.boolean().optional(),
  /** Shown on the maintenance or update screen, when set. */
  message: z.string().nullable().optional(),
  /** Where "Update" goes, e.g. the dApp Store listing. */
  updateUrl: z.string().nullable().optional(),
  /** The cluster the server runs on; shown on the dev screen to catch a mismatched build. */
  cluster: z.string().nullable().optional(),
  features: z
    .object({
      paidTrading: z.boolean().optional(),
      freeTrading: z.boolean().optional(),
      seekerPerk: z.boolean().optional(),
      onramp: z.boolean().optional(),
    })
    .optional(),
  /**
   * The scorers' numbers, for the "How to earn points" sheet. Read loosely and
   * allowed to be anything: `src/lib/points-rules.ts` takes the numbers it
   * knows and ignores the rest. A malformed block must not fail this parse,
   * because the kill switch and the minimum version ride in the same response.
   */
  points: z.record(z.string(), z.unknown()).nullable().optional().catch(undefined),
});
export type MobileConfig = z.infer<typeof MobileConfig>;

/** The server's rules for this app, or null when it has none (the route is not there yet). */
export async function getMobileConfig(): Promise<MobileConfig | null> {
  try {
    return await get('/api/mobile/config', MobileConfig);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
