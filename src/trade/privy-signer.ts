// The bridge from Privy's embedded Solana wallet to the ported signer.
//
// Privy's documented `signTransaction` takes a @solana/web3.js Transaction
// object, and this app is built on @solana/kit, so it would mean a second
// Solana library just to be unwrapped again. Underneath, that method does
// exactly what the ported `openfortSignOnly` does: it base64-encodes the
// transaction's message bytes, asks the wallet to `signMessage` them, and
// gets back a base64 Ed25519 signature over those bytes, unhashed (read from
// @privy-io/js-sdk-core 0.76.2, `handleSignTransaction`). So this calls
// `signMessage` the same way and hands the signature over, and the wire
// format stays entirely kit's.
//
// The ported signer parses base58 (Openfort's convention), so the base64
// signature is re-encoded here, and its length is checked first so a wrong
// answer fails with a message about Privy rather than a generic one.
import bs58 from 'bs58';

import type { OpenfortRawSign } from '@/auth/signer';
import { bytesToBase64 } from '@/chain/rpcSend';
import { base64ToBytes } from '@/lib/bytes';

/** The slice of Privy's Solana provider this app depends on. */
export type PrivySolanaProvider = {
  request(args: { method: 'signMessage'; params: { message: string } }): Promise<{ signature: string }>;
};

const ED25519_SIGNATURE_LEN = 64;

/**
 * Adapt a Privy wallet into the raw-bytes signer the ported signing code wants.
 *
 * `getProvider` is called per signature rather than once: Privy's provider
 * reconnects and recovers the wallet on each request, and a provider fetched
 * before a relaunch's recovery finished is not one to hold on to.
 */
export function rawSignWithPrivy(getProvider: () => Promise<PrivySolanaProvider>): OpenfortRawSign {
  return async (message: Uint8Array): Promise<string> => {
    const provider = await getProvider();
    const result = await provider.request({ method: 'signMessage', params: { message: bytesToBase64(message) } });
    if (!result?.signature) throw new Error('Privy returned no signature for the transaction.');
    const signature = base64ToBytes(result.signature);
    if (signature.length !== ED25519_SIGNATURE_LEN) {
      throw new Error(`Privy signature: expected ${ED25519_SIGNATURE_LEN} bytes, got ${signature.length}. Refusing to broadcast a malformed signature.`);
    }
    return bs58.encode(signature);
  };
}
