// Build and SIMULATE a real majority buy. Signs nothing.
import { API_BASE } from '../src/config';
import { buildTransaction, simulate } from '../src/trade/send';
import { planMajorityBuy } from '../src/trade/majority';

const WALLET = process.env.WALLET ?? 'EjM5dTpr3naaLt2FqcgFLMnXFmUbUi8xu8LGSSDGCBgR';

(async () => {
  const list = (await (await fetch(`${API_BASE}/api/paid-majority/list`)).json()) as {
    markets: { marketId: string; title: string; status: number; words: { word: string }[] }[];
  };
  const m = list.markets.find((x) => x.status === 0) ?? list.markets[0];
  if (!m) throw new Error('no majority market on this environment');
  console.log(`market: ${m.title} (${m.marketId})`);
  console.log(`board: ${m.words.map((w) => w.word).join(', ') || '(empty)'}`);

  // One word already on the board and one brand new, so both the cheap path and
  // the coin-a-new-word path (which pays rent) are exercised.
  const existing = m.words[0]?.word;
  const picks = [existing, 'mobiletest'].filter(Boolean) as string[];
  console.log(`picking: ${picks.join(', ')}`);

  const plan = await planMajorityBuy({ wallet: WALLET, marketId: BigInt(m.marketId), words: picks });
  console.log(`total $${plan.totalUsd} across ${plan.batches.length} transaction(s)`);

  for (const [i, batch] of plan.batches.entries()) {
    const tx = await buildTransaction(WALLET, batch);
    console.log(`batch ${i + 1}: ${batch.length} instructions, ${tx.length} bytes`);
    const logs = await simulate(tx);
    console.log(`  SIMULATION OK`);
    for (const l of logs.filter((x) => x.startsWith('Program log:'))) console.log('    ' + l);
  }
})().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
