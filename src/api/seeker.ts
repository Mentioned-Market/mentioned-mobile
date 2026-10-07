// The Seeker link and welcome stake (web: app/api/seeker). Every route but the
// pick's build answers with the same status shape, so the card renders from whichever call
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
  // The stake as one sponsored pick, which the server now offers in place of
  // cash (web: lib/seekerFreePick.ts). An account gets one or the other, so at
  // most one of `grant` and `freePick` is anything but 'unavailable'. A server
  // from before the pick sends no `freePick` at all, which reads as none.
  freePick: z
    .object({
      status: z.enum(['unavailable', 'available', 'processing', 'used']),
      /** The most a sponsored pick may cost. */
      usdcBaseUnits: z.string(),
      marketId: z.string().nullable(),
      word: z.string().nullable(),
      signature: z.string().nullable(),
    })
    .default({ status: 'unavailable', usdcBaseUnits: '0', marketId: null, word: null, signature: null }),
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

/**
 * Which of these wallets belong to an account with a linked Seeker, for the
 * mark beside a name. Public; at most 200 wallets a call. A read, though it is
 * a POST (the list is too long for a query string), so asking twice is safe.
 */
export const getSeekerVerified = (wallets: string[]) =>
  post('/api/seeker/verified', { wallets }, z.object({ verified: z.array(z.string()) })).then((r) => r.verified);

export const SeekerPickBuild = z.object({
  /** The pick, signed by the funder and waiting for this wallet's signature. */
  txBase64: z.string(),
  /** The transaction's signature. Final already: it is the fee payer's, the funder's. */
  signature: z.string(),
  marketId: z.string(),
  word: z.string(),
});
export type SeekerPickBuild = z.infer<typeof SeekerPickBuild>;

/**
 * Start the free pick: the server reserves it and returns the transaction that
 * funds and places it. Nothing moves until this wallet co-signs and it is
 * submitted. Asking again for the same market and word returns the same
 * transaction; the server never signs a second while the first could land.
 */
export const buildSeekerPick = (body: { marketId: string; word: string }) => post('/api/seeker/free-pick/build', body, SeekerPickBuild);

/**
 * Send the co-signed pick, or with no argument only ask where it stands. Safe
 * to call again: the server accepts the reserved transaction and nothing else,
 * and the same bytes can land once. A 202 answers with `freePick.status`
 * still 'processing', meaning it may yet land.
 */
export const submitSeekerPick = (signedTxBase64?: string) =>
  post('/api/seeker/free-pick/submit', signedTxBase64 ? { signedTxBase64 } : {}, SeekerStatus);
