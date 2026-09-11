// Paid YES/NO (AMM) trade construction.
//
// The quote maths and the instruction encoders are ported and shared with the
// web. What lives here is the part the web keeps in its page component: how a
// dollar amount becomes a share count, what slippage bound goes on chain, and
// which accounts have to exist first. Those rules are copied deliberately from
// the website's own buy and sell handlers, because a mobile trade that priced
// differently from the same trade in a browser would be a bug even if it
// succeeded.
import {
  createAtaIx,
  createBuyIx,
  createRedeemIx,
  createSellIx,
  estimateBuyCost,
  estimateSellReturn,
  sharesForUsdc,
  USDC_MINT,
  type UsdcMarketAccount,
  type WordState,
} from '@/chain/amm';
import { address as toAddress, type Instruction } from '@solana/kit';

export type Side = 'YES' | 'NO';

/**
 * Slippage bound, as a divisor: 2% of the all-in figure, matching the website.
 *
 * On a buy it raises the maximum cost the program will accept; on a sell it
 * lowers the minimum return. Without it a price that moves between quoting and
 * landing reverts the trade.
 */
const SLIPPAGE_DIVISOR = 50n;

/** Thrown before anything is built, when the trade cannot make sense. */
export class TradeInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TradeInputError';
  }
}

export type BuyPlan = {
  shares: bigint;
  cost: bigint;
  fee: bigint;
  maxCost: bigint;
  instructions: Instruction[];
};

/**
 * Turn a dollar amount into the instructions that buy it.
 *
 * Both associated token accounts are created idempotently every time: the USDC
 * account the cost leaves from, and the account for the side's own token. A
 * first-time buyer of a side has neither, and the program cannot create them.
 */
export async function planBuy(opts: {
  wallet: string;
  market: UsdcMarketAccount;
  word: WordState;
  side: Side;
  /** Dollars the user typed, as USDC base units. */
  usdcUnits: bigint;
}): Promise<BuyPlan> {
  const { wallet, market, word, side, usdcUnits } = opts;
  if (usdcUnits <= 0n) throw new TradeInputError('Enter an amount first.');

  const shares = sharesForUsdc(word, market.liquidityParamB, side, usdcUnits);
  if (shares <= 0n) throw new TradeInputError('That is too small to buy any shares.');

  const cost = estimateBuyCost(word, market.liquidityParamB, side, shares);

  // The share search stops where the pool's fixed-point maths would overflow,
  // so on a thin market a large amount quietly becomes a smaller trade: $9,999
  // typed once bought $293. Buying something other than what was entered is
  // never acceptable, so refuse and say what the market can actually take.
  // Two percent of headroom covers the search's share rounding.
  if (cost * 100n < usdcUnits * 98n) {
    const most = Number(cost) / 1e6;
    throw new TradeInputError(`This market can only take about $${most.toFixed(2)} on ${side} right now.`);
  }
  const fee = (cost * BigInt(market.tradeFeeBps)) / 10000n;
  const allIn = cost + fee;
  const maxCost = allIn + allIn / SLIPPAGE_DIVISOR;

  const owner = toAddress(wallet);
  const instructions = [
    await createAtaIx(owner, owner, USDC_MINT),
    await createAtaIx(owner, owner, side === 'YES' ? word.yesMint : word.noMint),
    await createBuyIx(owner, market.marketId, word.wordIndex, side, shares, maxCost),
  ];

  return { shares, cost, fee, maxCost, instructions };
}

export type SellPlan = {
  gross: bigint;
  fee: bigint;
  net: bigint;
  minReturn: bigint;
  instructions: Instruction[];
};

/**
 * Sell shares back to the pool.
 *
 * The program takes its fee off the gross return BEFORE checking the caller's
 * minimum, so the floor has to be derived from the net figure. Deriving it from
 * the gross made every sell on a market with a fee above 2% revert.
 */
export async function planSell(opts: {
  wallet: string;
  market: UsdcMarketAccount;
  word: WordState;
  side: Side;
  shares: bigint;
}): Promise<SellPlan> {
  const { wallet, market, word, side, shares } = opts;
  if (shares <= 0n) throw new TradeInputError('Enter how many shares to sell.');

  const gross = estimateSellReturn(word, market.liquidityParamB, side, shares);
  const fee = (gross * BigInt(market.tradeFeeBps)) / 10000n;
  const net = gross - fee;
  const minReturn = net - net / SLIPPAGE_DIVISOR;

  const owner = toAddress(wallet);
  const instructions = [
    await createAtaIx(owner, owner, USDC_MINT),
    await createAtaIx(owner, owner, side === 'YES' ? word.yesMint : word.noMint),
    await createSellIx(owner, market.marketId, word.wordIndex, side, shares, minReturn),
  ];

  return { gross, fee, net, minReturn, instructions };
}

/** Redeem a winning side on a resolved word. */
export async function planRedeem(opts: {
  wallet: string;
  market: UsdcMarketAccount;
  word: WordState;
  side: Side;
}): Promise<Instruction[]> {
  const owner = toAddress(opts.wallet);
  return [
    await createAtaIx(owner, owner, USDC_MINT),
    await createRedeemIx(owner, opts.market.marketId, opts.word.wordIndex, opts.side),
  ];
}

/**
 * Turn a raw chain or wallet error into something a trader can act on.
 *
 * Ported from the website's own mapping so the two surfaces say the same thing
 * about the same failure. Anchor's messages are accurate but are written for
 * whoever wrote the program, not for whoever is trading.
 */
export function friendlyTradeError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('min_return') || m.includes('max_cost') || m.includes('slippage')) {
    return 'The price moved while your trade was processing. Try again.';
  }
  if (m.includes('not open for trading') || m.includes('market is paused') || m.includes('trading is locked') || m.includes('locks_at')) {
    return 'Trading is closed for this market right now.';
  }
  if (m.includes('already resolved')) return 'This has already resolved, so it can no longer be traded.';
  if (m.includes('parameter b is zero') || m.includes('pool has no balance') || m.includes('zeroliquidity')) {
    return 'This market has no liquidity to trade against yet.';
  }
  if (m.includes('no tokens to redeem')) return 'There is nothing to redeem here.';
  if (m.includes('not yet resolved')) return 'This has not resolved yet.';
  if (m.includes('insufficient') && m.includes('lamports')) return 'Not enough SOL to cover the network fee.';
  if (m.includes('insufficient funds') || m.includes('insufficient balance')) return 'Not enough USDC for this trade.';
  if (m.includes('user rejected') || m.includes('declined')) return 'You cancelled the signature.';
  if (m.includes('blockhash not found')) return 'That took too long to sign. Try again.';
  return raw;
}
