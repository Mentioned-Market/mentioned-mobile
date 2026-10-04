// Moving USDC or SOL between wallets: a withdrawal signed by the app wallet, or
// a deposit signed by the Seeker wallet over MWA (SPEC section 6.4).
//
// The instructions are the two plainest on Solana, the System Program transfer
// and the SPL Token transfer, encoded here by hand in the same style as the
// ported builders in src/chain/amm.ts. The rules around them (what may be
// typed, what must be kept back for fees) are the part worth testing.
import { AccountRole, address as toAddress, isAddress, type AccountMeta, type Address, type Instruction } from '@solana/kit';

import { createAtaIx, getAssociatedTokenAddress, SYSTEM_PROGRAM, TOKEN_PROGRAM, USDC_MINT } from '@/chain/amm';
import { toBaseUnits } from '@/lib/units';
import { MIN_SOL_FOR_FEES } from '@/trade/majority';

export type TransferAsset = 'USDC' | 'SOL';

export const DECIMALS: Record<TransferAsset, number> = { USDC: 6, SOL: 9 };

/**
 * SOL a wallet keeps back when it sends SOL, so the next trade can still pay
 * its fee. The same figure the trade sheets require before they will sign.
 */
export const SOL_RESERVE = MIN_SOL_FOR_FEES;

export type TransferCheck = { units: bigint; to: Address } | { error: string };

/**
 * Whether a typed transfer can be built, and the exact amount if so.
 *
 * `balance` is the sender's balance of the asset in whole units (dollars or
 * SOL). Every refusal is a sentence the screen shows as it is.
 */
export function checkTransfer(input: { asset: TransferAsset; amount: string; to: string; from: string; balance: number | undefined }): TransferCheck {
  const to = input.to.trim();
  if (!to) return { error: 'Enter the wallet address to send to.' };
  if (!isAddress(to)) return { error: 'That is not a Solana wallet address.' };
  if (to === input.from) return { error: 'That is this wallet. Choose another address.' };

  const units = toBaseUnits(input.amount, DECIMALS[input.asset]);
  if (units <= 0n) return { error: 'Enter an amount.' };
  if (input.balance === undefined) return { error: 'Your balance is still loading.' };

  const scale = 10 ** DECIMALS[input.asset];
  const available = BigInt(Math.floor(input.balance * scale));
  if (input.asset === 'SOL') {
    const reserve = BigInt(Math.round(SOL_RESERVE * scale));
    const spendable = available > reserve ? available - reserve : 0n;
    if (units > spendable) {
      return { error: `You can send up to ${(Number(spendable) / scale).toFixed(4)} SOL. About ${SOL_RESERVE} SOL stays for network fees.` };
    }
  } else if (units > available) {
    return { error: `Not enough USDC. You have $${input.balance.toFixed(2)}.` };
  }
  return { units, to: toAddress(to) };
}

/** The most that can be sent, as typed text for the Max preset. */
export function maxTransfer(asset: TransferAsset, balance: number | undefined): string {
  if (balance === undefined || balance <= 0) return '';
  if (asset === 'USDC') return (Math.floor(balance * 100) / 100).toFixed(2);
  const spendable = Math.max(0, balance - SOL_RESERVE);
  return (Math.floor(spendable * 10_000) / 10_000).toString();
}

function u32LE(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n, true);
  return out;
}

function u64LE(n: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, n, true);
  return out;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

/** System Program `Transfer { lamports }` (instruction index 2). */
export function createSolTransferIx(from: Address, to: Address, lamports: bigint): Instruction {
  return {
    programAddress: SYSTEM_PROGRAM,
    accounts: [
      { address: from, role: AccountRole.WRITABLE_SIGNER },
      { address: to, role: AccountRole.WRITABLE },
    ] as AccountMeta[],
    data: concat(u32LE(2), u64LE(lamports)),
  };
}

/** SPL Token `Transfer { amount }` (instruction 3) between two token accounts owned as given. */
export function createTokenTransferIx(source: Address, destination: Address, owner: Address, amount: bigint): Instruction {
  return {
    programAddress: TOKEN_PROGRAM,
    accounts: [
      { address: source, role: AccountRole.WRITABLE },
      { address: destination, role: AccountRole.WRITABLE },
      { address: owner, role: AccountRole.READONLY_SIGNER },
    ] as AccountMeta[],
    data: concat(new Uint8Array([3]), u64LE(amount)),
  };
}

/**
 * The instructions that move `units` of `asset` from `from` to `to`.
 *
 * `payer` signs and pays the fee: the sender itself on a withdrawal, the Seeker
 * wallet on a deposit. A USDC transfer first creates the recipient's token
 * account idempotently, since a wallet that has never held USDC has none and
 * the token program will not make one.
 */
export async function planTransfer(opts: { asset: TransferAsset; from: string; to: Address; units: bigint; payer: string }): Promise<Instruction[]> {
  const from = toAddress(opts.from);
  if (opts.asset === 'SOL') return [createSolTransferIx(from, opts.to, opts.units)];
  const [source, destination] = await Promise.all([getAssociatedTokenAddress(USDC_MINT, from), getAssociatedTokenAddress(USDC_MINT, opts.to)]);
  return [await createAtaIx(toAddress(opts.payer), opts.to, USDC_MINT), createTokenTransferIx(source, destination, from, opts.units)];
}

/**
 * What a deposit says when its confirmation timed out. The transfer was
 * broadcast and may still land, so this never reads as a failure. It replaces
 * the ported timeout's own message, which is written for the website.
 */
export const TRANSFER_STILL_CONFIRMING = 'Still confirming. Check your balance in a moment before sending again.';

/** A chain or wallet error, as a sentence. */
export function friendlyTransferError(raw: string): string {
  if (/insufficient (funds|lamports)|0x1\b|Attempt to debit an account but found no record/i.test(raw)) {
    return 'Not enough in the wallet to cover the amount and the network fee.';
  }
  if (/declined|rejected|cancel|user denied|CANCELLED/i.test(raw)) return 'The wallet did not approve it. Nothing was sent.';
  if (/no wallet|ActivityNotFound|no compatible/i.test(raw)) return 'No wallet app answered. Open your Seeker wallet and try again.';
  if (/blockhash|expired|block height/i.test(raw)) return 'That took too long to sign and expired. Nothing was sent. Try again.';
  return raw;
}
