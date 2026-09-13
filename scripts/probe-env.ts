// Identify which chain and programs a deployment runs, without trusting config.
// Derives each candidate program's market PDA for a real market id and asks that
// deployment's own RPC proxy which one exists. Read-only.
import { address, getAddressEncoder, getProgramDerivedAddress } from '@solana/kit';

const BASE = process.env.BASE ?? 'https://mentioned-staging.up.railway.app';

const PAID = {
  'devnet (dev)': '9kSuebrHKKnFsgFcv5fc8S2gBazHA9Gki2NEWt2ft9tk',
  'mainnet (prod)': '7pL3oze39xX7NmGFtndTz3EjhkCP9AcoVtX6fVmxm9pn',
};
const MAJORITY = {
  'devnet (dev)': 'FYEiiL1iBRqHEGA8kU3gxVLDcGjSdE7aFRgjnYKxnisr',
  'mainnet (prod)': 'F1AVzZe4oX2cNDTvJjNFGWyYz4uxXxMwEqvTnamA2j9r',
};

const rpc = async (method: string, params: unknown[]) => {
  const res = await fetch(`${BASE}/api/paid-rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return (await res.json()) as { result?: { value?: { owner?: string; data?: [string, string] } | null }; error?: { message?: string } };
};

const u64 = (n: bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
};

(async () => {
  console.log(`base ${BASE}`);
  const paid = (await (await fetch(`${BASE}/api/paid-markets/list`)).json()) as { markets: { marketId: string; title: string }[] };
  const first = paid.markets[0];
  console.log(`paid market ${first.marketId} "${first.title}"`);

  for (const [label, programId] of Object.entries(PAID)) {
    const [pda] = await getProgramDerivedAddress({
      programAddress: address(programId),
      seeds: [new TextEncoder().encode('market'), u64(BigInt(first.marketId))],
    });
    const info = await rpc('getAccountInfo', [pda, { encoding: 'base64' }]);
    const owner = info.result?.value?.owner;
    console.log(`  paid ${label}: ${pda} -> ${owner ? `EXISTS owner ${owner}` : info.error?.message ?? 'not found'}`);
  }

  const maj = (await (await fetch(`${BASE}/api/paid-majority/list`)).json()) as { markets: { marketId: string; title: string }[] };
  if (maj.markets[0]) {
    console.log(`majority market ${maj.markets[0].marketId} "${maj.markets[0].title}"`);
    for (const [label, programId] of Object.entries(MAJORITY)) {
      const [pda] = await getProgramDerivedAddress({
        programAddress: address(programId),
        seeds: [new TextEncoder().encode('market'), u64(BigInt(maj.markets[0].marketId))],
      });
      const info = await rpc('getAccountInfo', [pda, { encoding: 'base64' }]);
      console.log(`  majority ${label}: ${pda} -> ${info.result?.value?.owner ? 'EXISTS' : info.error?.message ?? 'not found'}`);
    }
  }

  // The market account carries its own USDC mint, which settles the third id.
  const detail = (await (await fetch(`${BASE}/api/paid-markets/market/${first.marketId}`)).json()) as { account: string };
  const bytes = Uint8Array.from(Buffer.from(detail.account, 'base64'));
  const { deserializeMarketAccount } = await import('../src/chain/amm');
  const decoded = deserializeMarketAccount(bytes);
  console.log(`  usdc mint from the market account: ${decoded?.usdcMint ?? 'could not decode'}`);
  void getAddressEncoder;
})();
