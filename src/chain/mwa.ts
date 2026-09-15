// Mobile Wallet Adapter: the Seed Vault bridge (SPEC section 6.4). It does two
// things: authorize, to learn the Seeker wallet's address, and sign a deposit
// from that wallet into the app wallet. It never signs a trade.
import { transact, type KitMobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-kit';
import type { Instruction } from '@solana/kit';
import bs58 from 'bs58';

import { APP_IDENTITY, CLUSTER } from '../config';
import { base64ToBytes } from '../lib/bytes';
import { buildUnsignedTransaction, buildTransaction, simulate } from '../trade/send';

export type SeekerWallet = { address: string; authToken: string };

/** The chain the wallet is asked for, matching the flavour's cluster. */
const CHAIN = `solana:${CLUSTER}` as const;

async function authorize(wallet: KitMobileWallet, cachedToken: string | null): Promise<SeekerWallet> {
  const auth = await wallet.authorize({
    chain: CHAIN,
    identity: APP_IDENTITY,
    auth_token: cachedToken ?? undefined,
  });
  const account = auth.accounts[0];
  if (!account) throw new Error('The wallet returned no accounts');
  // MWA returns account.address as base64-encoded public key bytes.
  return { address: bs58.encode(base64ToBytes(account.address)), authToken: auth.auth_token };
}

export async function connectSeekerWallet(cachedToken: string | null): Promise<SeekerWallet> {
  return transact((wallet) => authorize(wallet, cachedToken));
}

/**
 * A deposit: the Seeker wallet pays for and signs a transaction built from
 * the instructions `build` returns for its address, all in one MWA session,
 * so the user approves once.
 *
 * Simulated before it is offered for signing, like everything else the app
 * sends; the wallet then broadcasts it itself and hands back the signature.
 */
export async function depositWithSeeker(
  cachedToken: string | null,
  build: (seekerAddress: string) => Promise<Instruction[]>,
): Promise<SeekerWallet & { signature: string }> {
  return transact(async (wallet) => {
    const seeker = await authorize(wallet, cachedToken);
    const instructions = await build(seeker.address);
    await simulate(await buildTransaction(seeker.address, instructions));
    const tx = await buildUnsignedTransaction(seeker.address, instructions);
    const [signature] = await wallet.signAndSendTransactions({ transactions: [tx] });
    if (!signature) throw new Error('The wallet returned no signature');
    return { ...seeker, signature: bs58.encode(signature) };
  });
}

export async function disconnectSeekerWallet(token: string): Promise<void> {
  await transact(async (wallet) => {
    await wallet.deauthorize({ auth_token: token });
  });
}

/** True when the failure means no MWA-capable wallet app is installed. */
export function isNoWalletError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /no wallet|not found|ActivityNotFound|resolve|no compatible/i.test(msg);
}
