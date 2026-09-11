// Build and SIMULATE a real buy against the configured cluster. Signs nothing.
// Proves instruction encoding, account ordering and program acceptance before a
// signature is ever requested.
import { deserializeMarketAccount } from '../src/chain/amm';
import { API_BASE } from '../src/config';
import { planBuy } from '../src/trade/amm';
import { buildTransaction, simulate } from '../src/trade/send';

const WALLET = process.env.WALLET ?? 'EjM5dTpr3naaLt2FqcgFLMnXFmUbUi8xu8LGSSDGCBgR';
const DOLLARS = Number(process.env.DOLLARS ?? '1');

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

(async () => {
  const list = (await (await fetch(`${API_BASE}/api/paid-markets/list`)).json()) as {
    markets: { marketId: string; title: string; status: number }[];
  };
  const open = list.markets.find((m) => m.status === 0) ?? list.markets[0];
  if (!open) throw new Error('no paid AMM market on this environment');
  console.log(`market: ${open.title} (${open.marketId})`);

  const detail = (await (await fetch(`${API_BASE}/api/paid-markets/market/${open.marketId}`)).json()) as { account: string };
  const market = deserializeMarketAccount(base64ToBytes(detail.account));
  if (!market) throw new Error('could not decode the market account');
  const word = market.words[0];
  console.log(`word: "${word.label}" idx ${word.wordIndex}, fee ${market.tradeFeeBps}bps`);

  const plan = await planBuy({
    wallet: WALLET,
    market,
    word,
    side: 'YES',
    usdcUnits: BigInt(Math.floor(DOLLARS * 1e6)),
  });
  console.log(`quote: $${DOLLARS} -> ${plan.shares} share units, cost ${plan.cost}, fee ${plan.fee}, maxCost ${plan.maxCost}`);
  console.log(`instructions: ${plan.instructions.length}`);

  const tx = await buildTransaction(WALLET, plan.instructions);
  console.log(`compiled: ${tx.length} bytes`);

  const logs = await simulate(tx);
  console.log('SIMULATION OK');
  for (const l of logs.filter((x) => x.startsWith('Program log:'))) console.log('  ' + l);
})().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
