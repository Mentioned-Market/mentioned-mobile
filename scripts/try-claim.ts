// Build and SIMULATE claims against the configured cluster. Signs nothing.
// Paid YES/NO: the full claim for every resolved market the wallet holds.
// Majority: a claim of CLAIMS_PER_TX words, only to prove it fits in one
// transaction (the simulation itself fails unless those words won).
import { deserializeMarketAccount, MarketStatus } from '../src/chain/amm';
import { API_BASE } from '../src/config';
import { CLAIMS_PER_TX, planAmmClaim, planMajorityClaims } from '../src/trade/claim';
import { buildTransaction, simulate } from '../src/trade/send';

const WALLET = process.env.WALLET ?? 'EjM5dTpr3naaLt2FqcgFLMnXFmUbUi8xu8LGSSDGCBgR';

(async () => {
  const list = (await (await fetch(`${API_BASE}/api/paid-markets/list`)).json()) as { markets: { marketId: string; title: string }[] };
  for (const m of list.markets) {
    const detail = (await (await fetch(`${API_BASE}/api/paid-markets/market/${m.marketId}`)).json()) as { account: string };
    const market = deserializeMarketAccount(Uint8Array.from(Buffer.from(detail.account, 'base64')));
    if (!market || market.status !== MarketStatus.Resolved) continue;
    const plan = await planAmmClaim(WALLET, market);
    console.log(`${m.title}: ${plan.batches.length} tx, redeem ${plan.redeemUnits}, rent ${plan.lamports}`);
    for (const batch of plan.batches) {
      const tx = await buildTransaction(WALLET, batch);
      console.log(`  size ${tx.length} bytes`);
      try {
        const sim = await simulate(tx);
        console.log('  simulation OK', JSON.stringify(sim).slice(0, 300));
      } catch (e) {
        console.log('  simulation FAILED', e instanceof Error ? e.message : e);
      }
    }
  }

  const words = ['alphaword', 'bravoword', 'charlieword', 'deltaword'].slice(0, CLAIMS_PER_TX);
  const [batch] = await planMajorityClaims({ wallet: WALLET, marketId: 1789117562931n, words });
  const tx = await buildTransaction(WALLET, batch);
  console.log(`majority claim of ${words.length} words: ${batch.length} instructions, ${tx.length} bytes (limit 1232)`);
})();
