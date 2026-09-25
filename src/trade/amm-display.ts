// What a paid YES/NO (AMM) market shows: multipliers and dollars, never
// cents, shares or percentages.
//
// The web moved AMM markets to multiplier odds in September 2026
// (lib/oddsDisplay.ts, ported as src/lib/oddsDisplay.ts). The app shows only
// that mode; there is no cents toggle. Majority markets and free markets are
// not AMM markets and keep their own display.
//
// Two places this deliberately goes further than the web page:
// - A payout is net of the market's winner rake everywhere. The web's buy
//   preview uses the gross share count, which overstates the payout on a
//   market with a rake, while its buttons and positions are net.
// - The fee line always says something. "fee $0.00" read like a bug; "No
//   trading fee" is the same fact, stated.
import { formatMultiplier, formatQuote, effectiveMultiplier, sellUnitsFromInput, type Side } from '@/lib/oddsDisplay';
import { redeemPayoutBaseUnits } from '@/chain/amm';
import { usdc } from '@/lib/format';

export type AmmFees = { feeBps: number; rakeBps: number };

/**
 * The multiplier on a Yes/No button: what $1 on that side pays if it wins,
 * net of the trade fee and the winner rake. Spot, not sized to a stake. Empty
 * for a resolved word, which shows its outcome instead.
 */
export function sideQuote(yesPrice: number, side: Side, fees: AmmFees, outcome: boolean | null = null): string {
  return formatQuote('multiplier', yesPrice, side, { feeBps: fees.feeBps, rakeBps: fees.rakeBps, outcome });
}

/**
 * A payout as dollars, rounded DOWN to the cent. A payout is a promise, so it
 * is never shown a fraction of a cent higher than it is, and it agrees with
 * the multiplier beside it, which rounds down too: $2.175 on $1 reads $2.17
 * and 2.17x, not $2.18 and 2.17x.
 */
export function payoutText(units: bigint): string {
  return usdc(units > 0n ? (units / 10_000n) * 10_000n : 0n);
}

/** What `shares` pay if their side wins, net of the rake, in USDC base units. */
export function payoutFor(shares: bigint, rakeBps: number): bigint {
  return shares > 0n ? redeemPayoutBaseUnits(shares, rakeBps) : 0n;
}

/** "No trading fee", or "Fee $0.01 (0.5%)", plus the rake on winnings if any. */
export function feeLine(fee: bigint, fees: AmmFees): string {
  const trade = fees.feeBps > 0 ? `Fee ${usdc(fee)} (${fees.feeBps / 100}%)` : 'No trading fee';
  return fees.rakeBps > 0 ? `${trade} · ${fees.rakeBps / 100}% on winnings` : trade;
}

export type BuyPreview = {
  /** Paid out if the side wins, net of the rake. */
  payout: bigint;
  /** Payout over everything paid, for this stake: e.g. "1.38x". Empty for nothing. */
  multiplier: string;
  fee: string;
};

/**
 * The quote for a buy. The multiplier here is sized to the stake, so it
 * includes the price moving as the order fills, unlike `sideQuote`.
 */
export function buyPreview(shares: bigint, cost: bigint, fee: bigint, fees: AmmFees): BuyPreview {
  const payout = payoutFor(shares, fees.rakeBps);
  return {
    payout,
    multiplier: formatMultiplier(effectiveMultiplier(Number(payout), Number(cost + fee))),
    fee: feeLine(fee, fees),
  };
}

/**
 * Shares to sell for a percent of the position. A casual user never sees a
 * share, so selling is by percent, and a remainder too small to sell later
 * snaps to the whole position (see sellUnitsFromInput).
 */
export function sellShares(held: bigint, percent: string): bigint {
  return sellUnitsFromInput(held, Number(percent) || 0, true);
}

export type SellPreview = {
  /** Received now, after the trade fee. */
  receive: bigint;
  /** What the shares kept would pay if the side wins, net of the rake. */
  keeps: bigint;
  fee: string;
};

export function sellPreview(held: bigint, shares: bigint, net: bigint, fee: bigint, fees: AmmFees): SellPreview {
  const kept = held > shares ? held - shares : 0n;
  return { receive: net, keeps: payoutFor(kept, fees.rakeBps), fee: feeLine(fee, fees) };
}
