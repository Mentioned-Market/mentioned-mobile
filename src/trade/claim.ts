// Collecting from a finished market.
//
// Paid YES/NO: one action per market, exactly as the website does it. Each
// word's token accounts are settled together: winning shares are redeemed at
// $1, losing shares (worth nothing once the market resolves) are burned, and
// every token account is closed so the SOL deposit paid to open it comes back.
// The website used to show separate redeem buttons per word and a reclaim card
// beside them, and dropped them: three buttons read as three different payouts.
//
// Paid majority: one claim instruction per winning word, several to a
// transaction. Refunds are not offered here at all; they are settled from the
// admin tab on the website (SPEC section 7.1).
import { address as toAddress, type Instruction } from '@solana/kit';

import {
  buildReclaimPlan,
  createAtaIx,
  fetchTokenAccountStates,
  formatSol,
  MarketStatus,
  USDC_MINT,
  type TokenAccountState,
  type UsdcMarketAccount,
} from '@/chain/amm';
import { createClaimIx, normalizeWord } from '@/chain/majority';
import { usd, usdc } from '@/lib/format';

/**
 * What a wallet can collect from one paid YES/NO market. Plain numbers rather
 * than bigints so it can sit in the query cache, which is written to disk as
 * JSON. Both amounts stay far below 2^53.
 */
export type AmmClaim = {
  /** USDC base units paid out for winning shares. */
  redeemUnits: number;
  /** Lamports returned by closing the token accounts. */
  lamports: number;
  /** Token accounts that will be closed. */
  closes: number;
};

/**
 * The website's own selection, word for word: every token account that exists
 * on a word with an outcome is closed, and its winning balance redeemed. Null
 * when there is nothing to collect, or the market has not resolved.
 */
export function ammClaimSummary(market: UsdcMarketAccount, states: TokenAccountState[]): AmmClaim | null {
  if (market.status !== MarketStatus.Resolved) return null;
  let redeemUnits = 0n;
  let lamports = 0n;
  let closes = 0;
  market.words.forEach((w, i) => {
    if (w.outcome === null) return;
    for (const side of ['YES', 'NO'] as const) {
      const state = states[i * 2 + (side === 'YES' ? 0 : 1)];
      if (!state?.exists) continue;
      if (state.amount > 0n && w.outcome === (side === 'YES')) redeemUnits += state.amount;
      lamports += state.lamports;
      closes += 1;
    }
  });
  if (closes === 0) return null;
  return { redeemUnits: Number(redeemUnits), lamports: Number(lamports), closes };
}

/** Every word's YES and NO mint, in the order `ammClaimSummary` expects. */
export const claimMints = (market: UsdcMarketAccount) => market.words.flatMap((w) => [w.yesMint, w.noMint]);

/** Read the wallet's token accounts for a market and summarise them. */
export async function fetchAmmClaim(wallet: string, market: UsdcMarketAccount): Promise<AmmClaim | null> {
  if (market.status !== MarketStatus.Resolved) return null;
  const states = await fetchTokenAccountStates(toAddress(wallet), claimMints(market));
  return ammClaimSummary(market, states);
}

/** e.g. "0.0045 SOL". */
export const solText = (lamports: number) => `${formatSol(BigInt(lamports))} SOL`;

/** The button: the money first, the deposit after, or the deposit alone. */
export function ammClaimLabel(c: AmmClaim): string {
  return c.redeemUnits > 0 ? `Claim ${usdc(c.redeemUnits)}` : `Reclaim ${solText(c.lamports)}`;
}

/** The line under it, saying what the one tap does. */
export function ammClaimDetail(c: AmmClaim): string {
  const accounts = `${c.closes} token account${c.closes === 1 ? '' : 's'}`;
  return c.redeemUnits > 0
    ? `Pays out your winning shares and returns ${solText(c.lamports)} in deposits from ${accounts}.`
    : `Returns ${solText(c.lamports)} in deposits from ${accounts}.`;
}

/**
 * The transactions to send, built from the chain as it is now rather than as
 * it was when the card was drawn. A stale balance would not lose anything,
 * since each transaction is all or nothing, but it would fail after the user
 * had already signed.
 */
export async function planAmmClaim(wallet: string, market: UsdcMarketAccount) {
  const owner = toAddress(wallet);
  const states = await fetchTokenAccountStates(owner, claimMints(market));
  const plan = await buildReclaimPlan(owner, market, states);
  return {
    batches: plan.txChunks,
    redeemUnits: Number(plan.redeemBaseUnits),
    lamports: Number(plan.reclaimLamports),
  };
}

/**
 * Claims per transaction. A claim carries no word bytes and only two accounts
 * of its own (the word entry and the position), so this is well inside the
 * 1232-byte limit, with room left for the USDC account instruction.
 */
export const CLAIMS_PER_TX = 4;

/** Claim every winning word of one majority market. */
export async function planMajorityClaims(opts: { wallet: string; marketId: bigint; words: string[] }): Promise<Instruction[][]> {
  const owner = toAddress(opts.wallet);
  const words = [...new Set(opts.words.map(normalizeWord))];
  // The payout lands in the wallet's USDC account. It exists for anyone who
  // bought, but creating it is free when it does, so the first batch makes sure.
  const ataIx = await createAtaIx(owner, owner, USDC_MINT);
  const batches: Instruction[][] = [];
  for (let i = 0; i < words.length; i += CLAIMS_PER_TX) {
    const claims = await Promise.all(words.slice(i, i + CLAIMS_PER_TX).map((w) => createClaimIx(owner, opts.marketId, w)));
    batches.push(i === 0 ? [ataIx, ...claims] : claims);
  }
  return batches;
}

export const majorityClaimLabel = (dollars: number) => `Claim ${usd(dollars)}`;

/**
 * A claim needs a network fee before anything is paid back, and an embedded
 * wallet commonly holds no SOL at all. The website's threshold.
 */
export const MIN_SOL_TO_CLAIM = 0.0001;

/** Plain language for a failed claim. */
export function friendlyClaimError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('alreadyclaimed') || m.includes('already claimed')) return 'This has already been claimed.';
  if (m.includes('no tokens to redeem')) return 'There is nothing left to claim here.';
  if (m.includes('not yet resolved') || m.includes('marketnotresolved')) return 'This market has not resolved yet.';
  if (m.includes('notwinner') || m.includes('not a winner') || m.includes('did not win')) return 'These did not win, so there is nothing to claim.';
  if (m.includes('insufficient') && m.includes('lamport')) return 'Not enough SOL for the network fee.';
  if (m.includes('accountnotinitialized') || m.includes('account does not exist')) return 'There is nothing left to claim here.';
  if (m.includes('user rejected') || m.includes('declined')) return 'You cancelled the signature.';
  if (m.includes('blockhash not found')) return 'That took too long to sign. Try again.';
  return 'The claim did not go through. Try again in a moment.';
}
