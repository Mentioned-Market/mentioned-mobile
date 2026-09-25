// Trade construction for the AMM. The maths underneath is ported and tested
// elsewhere; what is pinned here is the part written for mobile: the slippage
// bound that goes on chain, and which accounts get created first.
import { deserializeMarketAccount, estimateBuyCost, estimateSellReturn, sharesForUsdc } from '@/chain/amm';
import { friendlyTradeError, planBuy, planSell, TradeInputError } from '@/trade/amm';
import marketAccount from '../fixtures/paid-market-account.json';

function loadMarket() {
  const b64 = (marketAccount as { account: string }).account;
  const bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
  const acct = deserializeMarketAccount(bytes);
  if (!acct) throw new Error('fixture did not decode');
  return acct;
}

const WALLET = 'GjwcWFQYzemBtpUoN5fMAbtTfqxr3HHnMWxHzGoEt7HZ';

describe('planBuy', () => {
  it('allows exactly 2% over the all-in cost', async () => {
    // The bound the program enforces. Too tight and any movement reverts the
    // trade; too loose and the user silently overpays.
    const market = loadMarket();
    const word = market.words[0];
    const plan = await planBuy({ wallet: WALLET, market, word, side: 'YES', usdcUnits: 1_000_000n });

    const allIn = plan.cost + plan.fee;
    expect(plan.maxCost).toBe(allIn + allIn / 50n);
    expect(plan.maxCost).toBeGreaterThan(allIn);
  });

  it('charges the market fee on top of the pool cost', async () => {
    const market = loadMarket();
    const word = market.words[0];
    const plan = await planBuy({ wallet: WALLET, market, word, side: 'YES', usdcUnits: 1_000_000n });
    expect(plan.fee).toBe((plan.cost * BigInt(market.tradeFeeBps)) / 10000n);
  });

  it('quotes the same shares and cost as the shared maths', async () => {
    // Mobile must never price a trade differently from the website.
    const market = loadMarket();
    const word = market.words[0];
    const plan = await planBuy({ wallet: WALLET, market, word, side: 'YES', usdcUnits: 1_000_000n });
    const shares = sharesForUsdc(word, market.liquidityParamB, 'YES', 1_000_000n);
    expect(plan.shares).toBe(shares);
    expect(plan.cost).toBe(estimateBuyCost(word, market.liquidityParamB, 'YES', shares));
  });

  it('creates the USDC and side-token accounts before buying', async () => {
    // A first-time buyer of a side owns neither, and the program cannot make
    // them. Three instructions, with the buy last.
    const market = loadMarket();
    const plan = await planBuy({ wallet: WALLET, market, word: market.words[0], side: 'YES', usdcUnits: 1_000_000n });
    expect(plan.instructions).toHaveLength(3);
  });

  it('refuses an empty amount', async () => {
    const market = loadMarket();
    await expect(
      planBuy({ wallet: WALLET, market, word: market.words[0], side: 'YES', usdcUnits: 0n }),
    ).rejects.toBeInstanceOf(TradeInputError);
  });

  it('buys a large amount in full, never quietly less', async () => {
    // The real bug: $9,999 typed on a thin market bought $293, because the old
    // program maths overflowed and the share search stopped short. planBuy
    // refuses any fill more than 2% under what was typed. The 2026-09 program
    // upgrade (log-sum-exp normalisation, AMM_MATH_V2) removed the overflow,
    // so even $1,000,000 now fills, and the cost is what was asked.
    const market = loadMarket();
    const usdcUnits = 1_000_000_000_000n;
    const plan = await planBuy({ wallet: WALLET, market, word: market.words[0], side: 'YES', usdcUnits });
    expect(plan.cost * 100n).toBeGreaterThanOrEqual(usdcUnits * 98n);
    expect(plan.cost).toBeLessThanOrEqual(usdcUnits);
  });

  it('refuses an amount too small to buy a share', async () => {
    const market = loadMarket();
    await expect(
      planBuy({ wallet: WALLET, market, word: market.words[0], side: 'YES', usdcUnits: 1n }),
    ).rejects.toBeInstanceOf(TradeInputError);
  });
});

describe('planSell', () => {
  it('takes the slippage floor off the NET return, not the gross', async () => {
    // The program subtracts its fee before checking the floor. Deriving the
    // floor from the gross made every sell on a market with a fee above 2%
    // revert with a slippage error.
    const market = loadMarket();
    const word = market.words[0];
    const shares = 1_000_000n;
    const plan = await planSell({ wallet: WALLET, market, word, side: 'YES', shares });

    const gross = estimateSellReturn(word, market.liquidityParamB, 'YES', shares);
    const fee = (gross * BigInt(market.tradeFeeBps)) / 10000n;
    const net = gross - fee;
    expect(plan.gross).toBe(gross);
    expect(plan.net).toBe(net);
    expect(plan.minReturn).toBe(net - net / 50n);
    expect(plan.minReturn).toBeLessThan(net);
  });

  it('refuses a zero size', async () => {
    const market = loadMarket();
    await expect(
      planSell({ wallet: WALLET, market, word: market.words[0], side: 'YES', shares: 0n }),
    ).rejects.toBeInstanceOf(TradeInputError);
  });
});

describe('friendlyTradeError', () => {
  it.each([
    ['Return is below min_return slippage limit', 'The price moved while your trade was processing. Try again.'],
    ['Error: market is paused', 'Trading is closed for this market right now.'],
    ['Market already resolved', 'This has already resolved, so it can no longer be traded.'],
    ['ZeroLiquidity: parameter b is zero', 'This market has no liquidity to trade against yet.'],
    ['Attempt to debit an account but found no record of a prior credit: insufficient lamports', 'Not enough SOL to cover the network fee.'],
  ])('turns %s into plain language', (raw, expected) => {
    expect(friendlyTradeError(raw)).toBe(expected);
  });

  it('passes an unrecognised message through rather than inventing one', () => {
    // Better a raw message than a confident wrong explanation.
    expect(friendlyTradeError('Something nobody mapped')).toBe('Something nobody mapped');
  });
});
