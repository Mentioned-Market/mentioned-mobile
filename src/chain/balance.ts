// The wallet's spendable USDC, read straight from the chain.
//
// There is no API route for this: the web reads it client side too, because the
// balance is a property of the wallet, not of Mentioned. The paid RPC proxy
// allows `getTokenAccountBalance`, so deriving the associated token account and
// asking for it is the whole job.
//
// A wallet that has never held USDC has no token account at all, and the RPC
// answers with an error rather than a zero. That is not a failure: it is a real,
// knowable balance of zero, so it resolves to 0 instead of throwing. Only a
// transport failure throws, which is what lets the caller tell "you have no
// money" apart from "we could not reach the chain".
import { address as toAddress } from '@solana/kit';

import { RPC_URL, USDC_MINT } from '../config';
import { getAssociatedTokenAddress } from './amm';

/** Errors that mean "the token account does not exist", i.e. a balance of zero. */
function isMissingAccount(message: string): boolean {
  return /could not find account|not a Token account|Invalid param/i.test(message);
}

/** Spendable USDC in dollars for `owner`. Never negative; 0 when unfunded. */
export async function getUsdcBalance(owner: string): Promise<number> {
  const ata = await getAssociatedTokenAddress(toAddress(USDC_MINT), toAddress(owner));

  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenAccountBalance', params: [ata] }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status} reading USDC balance`);

  const json = (await res.json()) as {
    result?: { value?: { uiAmountString?: string; amount?: string; decimals?: number } };
    error?: { message?: string };
  };

  if (json.error) {
    if (isMissingAccount(json.error.message ?? '')) return 0;
    throw new Error(json.error.message ?? 'RPC error reading USDC balance');
  }

  const value = json.result?.value;
  if (!value) return 0;
  // Prefer the raw amount: uiAmountString is formatted by the node and has been
  // seen to lose precision on large balances.
  if (value.amount !== undefined && value.decimals !== undefined) {
    return Number(value.amount) / 10 ** value.decimals;
  }
  return Number(value.uiAmountString ?? 0);
}
