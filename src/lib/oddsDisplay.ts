// PORTED_FROM mentioned/lib/oddsDisplay.ts @ 2b5b452
// Keep byte-identical to the web copy. If the odds display rules change, change both.
// Mobile edits: none.

// Odds display: one quote, two ways of reading it.
//
// A winning share pays exactly 1 unit (1 play token on free markets, $1 USDC on
// the AMM) and the quoted price is the cost of one share, so
//
//   multiplier = payout / amount put in = 1 / price
//
// "42¢" and "2.38x" are the same quote. This module is the only place either
// one is formatted. Pure and dependency-free: safe on both sides of the
// client/server line. Spec: specs/odds_display_toggle_spec.md.

export type OddsMode = 'multiplier' | 'cents'
export type Side = 'YES' | 'NO'

export const DEFAULT_ODDS_MODE: OddsMode = 'multiplier'
export const ODDS_MODE_STORAGE_KEY = 'mentioned_odds_mode'

export function isOddsMode(v: unknown): v is OddsMode {
  return v === 'multiplier' || v === 'cents'
}

// Quotes are clamped so a near-zero price can never produce Infinity or a
// four-digit tease. 1 / 0.01 = 100, which formatMultiplier renders as "100x+".
const MIN_QUOTE_PRICE = 0.01
const MAX_QUOTE_PRICE = 0.99

// Guards the floor against float noise: 2.3 * 100 is 229.99999999999997, and
// flooring that would quote 2.29x for an exact 2.30x.
const FLOOR_EPSILON = 1e-9

/**
 * Multiplier at the margin: what the next unit put in pays back. `price` is the
 * side's 0..1 implied probability. On the AMM the trade fee is charged on top
 * of cost, so the quote is net of it; a multiplier is a promise about money
 * back and must never over-promise.
 */
export function marginalMultiplier(price: number, feeBps = 0, rakeBps = 0): number {
  if (!Number.isFinite(price)) return NaN
  const p = Math.min(MAX_QUOTE_PRICE, Math.max(MIN_QUOTE_PRICE, price))
  const fee = Number.isFinite(feeBps) && feeBps > 0 ? feeBps / 10_000 : 0
  const rake = Number.isFinite(rakeBps) && rakeBps > 0 ? rakeBps / 10_000 : 0
  return (1 - rake) / (p * (1 + fee))
}

/**
 * Multiplier for a specific fill: payout over everything paid (cost + fee).
 * Both arguments must be in the same unit. Lower than the marginal figure by
 * the LMSR slippage, exactly as today's avg price sits above the quoted price.
 */
export function effectiveMultiplier(payout: number, totalPaid: number): number {
  if (!Number.isFinite(payout) || !Number.isFinite(totalPaid)) return NaN
  if (payout <= 0 || totalPaid <= 0) return NaN
  return payout / totalPaid
}

/**
 * "2.38x" | "12.5x" | "2x" | "100x+". Floors, never rounds. '' when there is no
 * quote. A multiplier that lands on a whole number drops its decimals, so a
 * 50/50 word reads "2x", not "2.00x". Anything else keeps full precision
 * ("2.50x" stays), so a column of quotes doesn't jitter between widths.
 */
export function formatMultiplier(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return ''
  if (m >= 100) return '100x+'
  const decimals = m >= 10 ? 1 : 2
  const scale = 10 ** decimals
  const floored = Math.floor(m * scale + FLOOR_EPSILON) / scale
  return `${Number.isInteger(floored) ? floored.toFixed(0) : floored.toFixed(decimals)}x`
}

/**
 * Cents for a side, reproducing the pre-toggle arithmetic exactly: YES is
 * rounded, NO is its complement. A 41.5% word reads 42 / 58, never 42 / 59.
 */
export function sideCents(yesPrice: number, side: Side): number {
  const yes = Math.round(yesPrice * 100)
  return side === 'YES' ? yes : 100 - yes
}

export interface QuoteOptions {
  /** AMM trade fee. Only the multiplier is net of it; cents never were. */
  feeBps?: number
  /**
   * AMM winner rake (bps of payout, taken at redeem). A winning share pays
   * 1 - rake, so the multiplier must be net of it too: it is a promise about
   * money back. 0 on free markets and on pre-rake AMM markets. Cents are
   * untouched, exactly as with feeBps.
   */
  rakeBps?: number
  /** Word outcome: true = YES won, false = NO won, null/undefined = live. */
  outcome?: boolean | null
}

/**
 * The string on a Yes/No button. Resolved words have no live quote: cents mode
 * keeps the historical forced 100¢ / 0¢, multiplier mode returns '' and the
 * caller renders the bare side label.
 */
export function formatQuote(
  mode: OddsMode,
  yesPrice: number,
  side: Side,
  opts: QuoteOptions = {},
): string {
  const resolved = opts.outcome === true || opts.outcome === false
  if (mode === 'cents') {
    if (resolved) {
      const yes = opts.outcome ? 100 : 0
      return `${side === 'YES' ? yes : 100 - yes}¢`
    }
    return `${sideCents(yesPrice, side)}¢`
  }
  if (resolved) return ''
  const price = side === 'YES' ? yesPrice : 1 - yesPrice
  return formatMultiplier(marginalMultiplier(price, opts.feeBps, opts.rakeBps))
}

/**
 * Price cell on a trades feed row. Cents mode is unchanged (the YES price after
 * the trade, whatever side traded). Multiplier mode quotes the trade's own
 * side, because "2.38x" next to a No trade has to describe that No.
 */
export function formatTradeQuote(mode: OddsMode, yesPriceAfter: number, side: Side): string {
  if (mode === 'cents') return `${Math.round(yesPriceAfter * 100)}¢`
  return formatQuote('multiplier', yesPriceAfter, side)
}

// ── Sell sizing ────────────────────────────────────────────────────────────
//
// Cents mode sells a typed share count. Multiplier mode sells a percentage of
// the position, since a casual user never sees a share. Both resolve to shares
// here, and both snap to the whole position when the remainder would be
// unsellable dust. The old "Max" preset truncated to 2dp and left sub-0.01
// remainders behind on every full exit.

/** Below this a free-market remainder cannot be sold (the API rejects < 0.01). */
export const FREE_SHARE_DUST = 0.01
/** Same threshold on the AMM, in 6-decimal base units (0.01 shares). */
export const PAID_SHARE_DUST = 10_000n

function clampPercent(input: number): number {
  if (!Number.isFinite(input) || input <= 0) return 0
  return Math.min(100, input)
}

/** Free markets (float shares). `input` is a percent in percentMode, else shares. */
export function sellSharesFromInput(held: number, input: number, percentMode: boolean): number {
  if (!(held > 0) || !Number.isFinite(input) || input <= 0) return 0
  let shares: number
  if (percentMode) {
    const pct = clampPercent(input)
    shares = pct >= 100 ? held : (held * pct) / 100
  } else {
    // Over-asks are left alone so the API's "Insufficient shares" still fires.
    if (input > held) return input
    shares = input
  }
  return held - shares < FREE_SHARE_DUST ? held : shares
}

/** AMM (bigint base units). `input` is a percent in percentMode, else shares. */
export function sellUnitsFromInput(held: bigint, input: number, percentMode: boolean): bigint {
  if (held <= 0n || !Number.isFinite(input) || input <= 0) return 0n
  let units: bigint
  if (percentMode) {
    const pct = clampPercent(input)
    // Hundredths of a percent keep the division exact in bigint.
    units = pct >= 100 ? held : (held * BigInt(Math.floor(pct * 100))) / 10_000n
  } else {
    const raw = BigInt(Math.floor(input * 1_000_000))
    units = raw > held ? held : raw
  }
  return held - units < PAID_SHARE_DUST ? held : units
}
