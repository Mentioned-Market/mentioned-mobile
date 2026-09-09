// Mobile Wallet Adapter: the Seed Vault bridge (V0_GUIDE section 8). In v0 it
// only authorizes to learn the wallet address. Nothing is signed.
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-kit';
import bs58 from 'bs58';

import { APP_IDENTITY } from '../config';
import { base64ToBytes } from '../lib/bytes';

export type SeekerWallet = { address: string; authToken: string };

export async function connectSeekerWallet(cachedToken: string | null): Promise<SeekerWallet> {
  return transact(async (wallet) => {
    const auth = await wallet.authorize({
      chain: 'solana:mainnet',
      identity: APP_IDENTITY,
      auth_token: cachedToken ?? undefined,
    });
    const account = auth.accounts[0];
    if (!account) throw new Error('The wallet returned no accounts');
    // MWA returns account.address as base64-encoded public key bytes.
    return { address: bs58.encode(base64ToBytes(account.address)), authToken: auth.auth_token };
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
