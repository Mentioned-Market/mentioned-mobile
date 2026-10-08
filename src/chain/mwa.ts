// Mobile Wallet Adapter: the Seed Vault bridge (SPEC section 6.4). For an
// Openfort or Privy account it does three things: authorize, to learn the
// Seeker wallet's address; sign a deposit from that wallet into the app
// wallet; and sign the one message that links the Seeker to the account (SPEC
// section 6.5). It never signs a trade for those accounts.
//
// An account signed in with the Seeker itself is the exception: there the Seed
// Vault wallet is the account, so it signs the sign-in message and every
// trade (see src/trade/seeker-signer.ts).
import { transact, type KitMobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-kit';
import type { Instruction, Transaction } from '@solana/kit';
import bs58 from 'bs58';

import { APP_IDENTITY, CLUSTER } from '../config';
import { base64ToBytes, bytesToBase64 } from '../lib/bytes';
import { signatureFromSignedPayload } from '../lib/seeker-perk';
import { buildUnsignedTransaction, buildTransaction, simulate } from '../trade/send';

export type SeekerWallet = { address: string; authToken: string };

/** The chain the wallet is asked for, matching the flavour's cluster. */
const CHAIN = `solana:${CLUSTER}` as const;

async function authorize(wallet: KitMobileWallet, cachedToken: string | null, chain: `solana:${string}` = CHAIN): Promise<SeekerWallet> {
  const auth = await wallet.authorize({
    chain,
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

/**
 * Sign a text message with the Seeker wallet, in one MWA session: authorize to
 * learn the address, build the message for it, then sign. `build` gets the
 * address because the link message names the wallet that signs it.
 *
 * Only for the Seeker link. Never pass it transaction bytes: a message is
 * shown to the person as text, and signing anything else this way is how a
 * wallet gets tricked.
 *
 * Always a fresh authorization on mainnet, never the cached token. Seed Vault
 * refuses a token issued for another chain (error -1, no prompt shown), and the
 * cached token is whatever the last deposit used: on a devnet build after a
 * production one, that is a mainnet token sent with a devnet request. A message
 * signature does not depend on the cluster, and the Genesis Token the server
 * then looks for only exists on mainnet. The returned token is therefore NOT
 * one to cache for deposits, which authorize on the build's own cluster.
 */
export async function signMessageWithSeeker(
  build: (seekerAddress: string) => string,
): Promise<SeekerWallet & { message: string; signature: string }> {
  return transact(async (wallet) => {
    const seeker = await authorize(wallet, null, 'solana:mainnet');
    const message = build(seeker.address);
    const [signed] = await wallet.signMessages({
      // MWA addresses accounts by base64 public key, not base58.
      addresses: [bytesToBase64(bs58.decode(seeker.address))],
      payloads: [new TextEncoder().encode(message)],
    });
    if (!signed) throw new Error('The wallet returned no signature');
    return { ...seeker, message, signature: bytesToBase64(signatureFromSignedPayload(signed)) };
  });
}

/**
 * Authorize with the cached token, and ask afresh if the wallet will not take
 * it. A token is refused when it was issued for another chain or has been
 * revoked, and Seed Vault answers that with an error and no prompt, so without
 * the second ask the person would be stuck until they cleared the app's data.
 * Asking again signs nothing and sends nothing.
 */
async function authorizeAgain(wallet: KitMobileWallet, cachedToken: string | null): Promise<SeekerWallet> {
  if (!cachedToken) return authorize(wallet, null);
  try {
    return await authorize(wallet, cachedToken);
  } catch {
    return authorize(wallet, null);
  }
}

/**
 * Sign the sign-in message with the Seeker wallet, in one MWA session:
 * authorize to learn the address, then sign. The wallet that signs becomes the
 * account (see src/lib/seeker-session.ts).
 *
 * Authorized on the build's own cluster, unlike the link message above,
 * because the token it returns is the one the trades that follow will use.
 */
export async function signInWithSeeker(
  cachedToken: string | null,
  build: () => string,
): Promise<SeekerWallet & { message: string; signature: string }> {
  return transact(async (wallet) => {
    const seeker = await authorizeAgain(wallet, cachedToken);
    const message = build();
    const [signed] = await wallet.signMessages({
      addresses: [bytesToBase64(bs58.decode(seeker.address))],
      payloads: [new TextEncoder().encode(message)],
    });
    if (!signed) throw new Error('The wallet returned no signature');
    return { ...seeker, message, signature: bytesToBase64(signatureFromSignedPayload(signed)) };
  });
}

/** Raised when the wallet app offers a different account from the one signed in. */
export class WrongSeekerWalletError extends Error {
  constructor(expected: string, got: string) {
    super(`This account is ${expected}, but the wallet offered ${got}. Choose the wallet you signed in with.`);
    this.name = 'WrongSeekerWalletError';
  }
}

/**
 * Have the Seeker wallet sign one transaction, for an account signed in with
 * it. Signs only: the app broadcasts through its own proxy like every other
 * trade, so the wallet's answer is the same shape as an embedded wallet's.
 *
 * The caller has already simulated the transaction. `expected` is the session
 * wallet: a wallet app can hold several accounts, and a transaction paid for
 * by one and signed by another is rejected by the chain, so any other account
 * stops here before anything is signed.
 */
export async function signTransactionWithSeeker(
  cachedToken: string | null,
  expected: string,
  transaction: Transaction,
): Promise<{ authToken: string; transaction: Transaction }> {
  return transact(async (wallet) => {
    const seeker = await authorizeAgain(wallet, cachedToken);
    if (seeker.address !== expected) throw new WrongSeekerWalletError(expected, seeker.address);
    const [signed] = await wallet.signTransactions({ transactions: [transaction] });
    if (!signed) throw new Error('The wallet returned no signature');
    return { authToken: seeker.authToken, transaction: signed };
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
