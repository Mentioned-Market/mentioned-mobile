// Referrals: what a wallet has earned from the people it brought in, and the
// link that brings more. Shapes captured Sep 14 2026 from app/api/referral.
//
// The earnings are a cash share of the house rake the referrals generate (the
// website's lib/referral.ts): 2% of their majority volume and 20% of their AMM
// fees, computed from indexed trades and paid out weekly. No points.
import { z } from 'zod';

import { API_BASE } from '@/config';
import { get, q } from './client';

export const ReferredUser = z.object({
  wallet: z.string(),
  username: z.string().nullable(),
  createdAt: z.string(),
});
export type ReferredUser = z.infer<typeof ReferredUser>;

export const Referral = z.object({
  referralCode: z.string().nullable(),
  referralCount: z.number(),
  referredBy: z.string().nullable(),
  /** All-time cash rev-share, in dollars. */
  earningsUsd: z.number(),
  /** Legacy points from the old scheme; not shown. */
  bonusPointsEarned: z.number().optional(),
  referredUsers: z.array(ReferredUser),
});
export type Referral = z.infer<typeof Referral>;

/** Public. Creates the wallet's code on first read if it has none. */
export const getReferral = (wallet: string) => get(`/api/referral${q({ wallet })}`, Referral);

/** The rates behind the earned figure, for the line that explains it. */
export const REVSHARE_MAJORITY_PCT = 2;
export const REVSHARE_AMM_FEE_PCT = 20;

/**
 * The link to share. Built on whichever deployment the app points at, so a
 * staging build shares a staging link rather than one that lands on production.
 */
export const referralLink = (code: string) => `${API_BASE}/ref/${encodeURIComponent(code)}`;

/** The website's referral card image, the same one its /referrals page shows. */
export const referralCardUrl = (code: string) => `${API_BASE}/api/og/referral?code=${encodeURIComponent(code)}&v=3`;
