// The Seeker link and welcome stake (web: app/api/seeker). All three routes
// answer with the same status shape, so the card renders from whichever call
// came back last.
//
// Amounts are strings of base units, as the server sends them, so no bigint is
// rounded through JSON.
import { z } from 'zod';

import { get, post } from './client';

export const SeekerStatus = z.object({
  linked: z.boolean(),
  seekerWallet: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  grant: z.object({
    status: z.enum(['unavailable', 'available', 'processing', 'funded']),
    usdcBaseUnits: z.string(),
    lamports: z.string(),
    signature: z.string().nullable(),
  }),
});
export type SeekerStatus = z.infer<typeof SeekerStatus>;

export const getSeekerStatus = () => get('/api/seeker/status', SeekerStatus);

/** Prove the Seeker: the Seed Vault's signature over lib/seekerLinkMessage's text. Moves no money. */
export const linkSeeker = (body: { seekerWallet: string; message: string; signature: string }) =>
  post('/api/seeker/link', body, SeekerStatus);

/**
 * Collect the welcome stake. Safe to call again, including after a 202: the
 * server settles an earlier attempt from the chain before it ever signs another,
 * so calling twice can never pay twice. That is what makes "Check again" this
 * same call rather than a second transfer.
 */
export const claimSeekerGrant = () => post('/api/seeker/grant', {}, SeekerStatus);
