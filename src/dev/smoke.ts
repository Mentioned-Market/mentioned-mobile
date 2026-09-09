// V0_GUIDE section 5 smoke tests. Runs on the device (dev screen) and in Node
// (`npm run smoke`). Proves the ported SDKs against live production data:
// polyfill (PDA derivation), deserializers, and the quote maths.
import {
  deserializeMarketAccount,
  estimateBuyCost,
  formatUsdc,
  getMarketPDA as getAmmMarketPDA,
  impliedYesPrice,
  PROGRAM_ID as AMM_PROGRAM_ID,
  sharesForUsdc,
} from '../chain/amm';
import {
  deserializeMajorityMarket,
  getMarketPDA as getMajorityMarketPDA,
  PROGRAM_ID as MAJORITY_PROGRAM_ID,
} from '../chain/majority';
import { API_BASE, RPC_URL } from '../config';

export type SmokeResult = { name: string; ok: boolean; detail: string };

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(`rpc ${method}: ${json.error.message}`);
  return json.result as T;
}

type AccountInfo = { value: { data: [string, string]; owner: string } | null };
type MajorityListEntry = { marketId: string; title: string };
type AmmListEntry = {
  marketId: string;
  title: string;
  status: number;
  words: { label: string; yesPrice: number }[];
};

export async function runSmokeTests(): Promise<SmokeResult[]> {
  const results: SmokeResult[] = [];
  const run = async (name: string, fn: () => Promise<string>) => {
    try {
      results.push({ name, ok: true, detail: await fn() });
    } catch (e) {
      results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  };

  const majList = await getJson<{ markets: MajorityListEntry[] }>('/api/paid-majority/list');
  const maj = majList.markets[0];
  const ammList = await getJson<{ markets: AmmListEntry[] }>('/api/paid-markets/list');
  const amm = ammList.markets.find((m) => m.status === 0) ?? ammList.markets[0];
  if (!maj || !amm) throw new Error('no markets returned by the list routes');

  await run('1. majority PDA derives to the on-chain account', async () => {
    const pda = await getMajorityMarketPDA(BigInt(maj.marketId));
    const info = await rpc<AccountInfo>('getAccountInfo', [pda, { encoding: 'base64' }]);
    if (!info.value) throw new Error(`no account at ${pda}`);
    if (info.value.owner !== MAJORITY_PROGRAM_ID) throw new Error(`owner is ${info.value.owner}`);
    const acct = deserializeMajorityMarket(base64ToBytes(info.value.data[0]));
    if (!acct) throw new Error('deserializeMajorityMarket returned null');
    if (acct.marketId !== BigInt(maj.marketId)) throw new Error(`marketId ${acct.marketId}`);
    return `${pda} owned by the majority program, marketId ${acct.marketId}`;
  });

  await run('2. majority decode matches route totalUnits', async () => {
    const m = await getJson<{ account: string; totalUnits: string; vaultAmount: string }>(
      `/api/paid-majority/market/${maj.marketId}`,
    );
    const acct = deserializeMajorityMarket(base64ToBytes(m.account));
    if (!acct) throw new Error('deserializeMajorityMarket returned null');
    if (acct.totalUnits !== BigInt(m.totalUnits)) {
      throw new Error(`decoded ${acct.totalUnits}, route ${m.totalUnits}`);
    }
    return `"${maj.title}": ${acct.totalUnits} units, ${acct.wordCount} words, vault ${formatUsdc(BigInt(m.vaultAmount))}`;
  });

  let ammAcct: ReturnType<typeof deserializeMarketAccount> = null;
  await run('3. AMM decode matches list route YES prices', async () => {
    const m = await getJson<{ account: string }>(`/api/paid-markets/market/${amm.marketId}`);
    ammAcct = deserializeMarketAccount(base64ToBytes(m.account));
    if (!ammAcct) throw new Error('deserializeMarketAccount returned null');
    const [pda] = await getAmmMarketPDA(ammAcct.marketId);
    const info = await rpc<AccountInfo>('getAccountInfo', [pda, { encoding: 'base64' }]);
    if (info.value?.owner !== AMM_PROGRAM_ID) throw new Error(`PDA ${pda} owner ${info.value?.owner}`);
    let maxDiff = 0;
    for (const w of ammAcct.words) {
      const listed = amm.words.find((x) => x.label === w.label);
      if (!listed) throw new Error(`word "${w.label}" not in list route`);
      const diff = Math.abs(impliedYesPrice(w, ammAcct.liquidityParamB) - listed.yesPrice);
      maxDiff = Math.max(maxDiff, diff);
    }
    // The list route is cached for 8s, so a live trade can move prices slightly.
    if (maxDiff > 0.02) throw new Error(`max YES price diff ${maxDiff.toFixed(4)}`);
    return `"${amm.title}": ${ammAcct.words.length} words, max YES price diff ${maxDiff.toExponential(2)}`;
  });

  await run('4. $1 YES quote round-trips through the maths', async () => {
    if (!ammAcct) throw new Error('needs test 3');
    const word = ammAcct.words[0];
    const b = ammAcct.liquidityParamB;
    const shares = sharesForUsdc(word, b, 'YES', 1_000_000n);
    const cost = estimateBuyCost(word, b, 'YES', shares);
    if (shares <= 0n) throw new Error('zero shares for $1');
    if (cost > 1_000_000n || cost < 980_000n) throw new Error(`cost ${cost} for ${shares} shares`);
    return `"${word.label}": $1 buys ${shares} share units (cost ${formatUsdc(cost)}). Compare with the $1 quote on ${API_BASE}/market/${amm.marketId}`;
  });

  return results;
}
