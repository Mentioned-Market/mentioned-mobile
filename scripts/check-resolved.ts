// Read-only: resolved paid AMM markets on this environment, and what the
// wallet could claim from each. Signs nothing.
import { address } from '@solana/kit';
import { buildReclaimPlan, deserializeMarketAccount, fetchTokenAccountStates, MarketStatus } from '../src/chain/amm';
import { API_BASE } from '../src/config';

const WALLET = process.env.WALLET ?? 'EjM5dTpr3naaLt2FqcgFLMnXFmUbUi8xu8LGSSDGCBgR';

(async () => {
  const list = (await (await fetch(`${API_BASE}/api/paid-markets/list`)).json()) as { markets: { marketId: string; title: string; status: number }[] };
  for (const m of list.markets) {
    const detail = (await (await fetch(`${API_BASE}/api/paid-markets/market/${m.marketId}`)).json()) as { account: string };
    const market = deserializeMarketAccount(Uint8Array.from(Buffer.from(detail.account, 'base64')));
    if (!market) continue;
    console.log(`${m.marketId} "${m.title}" status=${MarketStatus[market.status]} words=${market.words.map((w) => `${w.label}:${w.outcome}`).join(', ')}`);
    if (market.status !== MarketStatus.Resolved) continue;
    const states = await fetchTokenAccountStates(address(WALLET), market.words.flatMap((w) => [w.yesMint, w.noMint]));
    states.forEach((s, i) => s.exists && console.log(`  ${market.words[i >> 1].label} ${i % 2 ? 'NO' : 'YES'} amount=${s.amount} lamports=${s.lamports}`));
    const plan = await buildReclaimPlan(address(WALLET), market, states);
    console.log(`  plan: ${plan.txChunks.length} tx, ${plan.txChunks.map((c) => c.length)} ixs, redeem=${plan.redeemBaseUnits}, rent=${plan.reclaimLamports}, closes=${plan.accountsToClose}`);
  }
})();
