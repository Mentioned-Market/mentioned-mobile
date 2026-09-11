// The bridge from Openfort's React Native wallet provider to the ported signer.
//
// THE TRAP THIS EXISTS TO AVOID. The web signs by handing `signMessage` a raw
// `Uint8Array`. On React Native that is silently wrong: the SDK talks to its
// embedded wallet across a WebView, whose postMessage carries only strings, and
// a Uint8Array serialises to `{"0":1,"1":2,...}` rather than an array. The
// signature would be over the wrong bytes.
//
// The React Native SDK solves this in its own `signTransaction`, which wraps the
// bytes as `{ type: 'Buffer', data: [...] }` before sending them across. Its
// Uint8Array branch passes the bytes straight through to that encoding, so
// calling it with the canonical message bytes gives exactly the signature the
// ported `openfortSignOnly` expects, with the bridge encoding handled by the
// SDK rather than by us.
//
// Which means: never call `signMessage` directly from this app. Go through the
// provider's `signTransaction`.
import type { OpenfortRawSign } from '@/auth/signer';

/** The slice of Openfort's Solana provider this app depends on. */
export type SolanaSigningProvider = {
  readonly publicKey: string;
  signTransaction(transaction: unknown): Promise<{ signature: string; publicKey?: string }>;
};

/**
 * Adapt the provider into the raw-bytes signer the ported signing code wants.
 *
 * Returns the base58 signature string, which is Openfort's Solana convention
 * and what `decodeEd25519Signature` parses.
 */
export function rawSignWithProvider(provider: SolanaSigningProvider): OpenfortRawSign {
  return async (message: Uint8Array): Promise<string> => {
    const signed = await provider.signTransaction(message);
    if (!signed?.signature) {
      throw new Error('Openfort returned no signature for the transaction.');
    }
    return signed.signature;
  };
}
