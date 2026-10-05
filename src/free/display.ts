// What a free YES/NO market shows: multipliers and tokens, the same reading
// of the odds as a paid one (src/trade/amm-display.ts), in play tokens rather
// than dollars.
//
// A winning share pays one token and the price is what a share costs, so the
// multiplier is 1 / price: "40%" and "2.50x" are the same quote. The app showed
// free markets as a chance until Oct 2026, while paid markets and the website
// had both moved to multipliers, so the same word read as "46%" on one market
// and "2.17x" on the next. A free market has no trade fee and no winner rake,
// which is the only difference from the paid quote.
//
// Free MAJORITY markets are not this: a board shows each word's share of the
// pool, as a paid majority board does.
import { effectiveMultiplier, formatMultiplier, formatQuote, type Side } from '@/lib/oddsDisplay';

/**
 * The multiplier on a Yes/No button: what one token on that side pays if it
 * wins. Spot, not sized to a stake. Empty for a resolved word, which shows its
 * outcome instead.
 */
export function freeQuote(yesPrice: number, side: Side, outcome: boolean | null = null): string {
  return formatQuote('multiplier', yesPrice, side, { outcome });
}

/**
 * The multiplier for one buy: tokens paid out if it wins over tokens put in.
 * Sized to the stake, so it includes the price moving as the order fills and
 * sits a little under `freeQuote`. Empty when there is nothing to quote.
 */
export function freeBuyMultiplier(sharesOut: number, cost: number): string {
  return formatMultiplier(effectiveMultiplier(sharesOut, cost));
}
