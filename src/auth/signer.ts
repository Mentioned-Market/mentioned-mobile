// PORTED_FROM mentioned/lib/openfortSolanaSigner.ts @ a7b8121
// Keep byte-identical to the web copy. If the signing contract changes,
// change both. Mobile edits: none. The web is on @solana/kit 6 and the app
// pins 7.1.1; the three symbols used here exist unchanged in both.
// Openfort Solana transaction signing — the real-cash-critical seam.
//
// The core @openfort/openfort-js SDK exposes NO Solana `signTransaction`; it only
// signs raw bytes: `embeddedWallet.signMessage(bytes, { hashMessage: false })`
// (Ed25519, no keccak hashing), returning a base58-encoded 64-byte signature.
// This mirrors exactly what Openfort's own @openfort/react Solana provider does
// under the hood (getTransactionBytes -> signMessage(hashMessage:false)).
//
// Our wallet layer signs-only and broadcasts through a same-origin proxy, so the
// `signOnly` contract (see lib/mentionMarketUsdc.ts `sendInstructions`) is:
//   input:  a fully-compiled wire transaction with an empty signature slot
//   output: the same transaction with the signer's signature filled in
//
// Rather than hand-splice bytes at compact-u16 offsets, we let @solana/kit's
// audited transaction codec own the wire format: decode -> sign the canonical
// `messageBytes` -> place the signature in the signatures map keyed by address ->
// re-encode. We only ever provide the 64 signature bytes for our own address; the
// serialization is entirely kit's. This module is a pure function of an injected
// signer, so it is fully unit-testable with a local Ed25519 keypair (see
// scripts/test-openfort-signer.ts) without any live Openfort credentials.

import {
  address as toAddress,
  getTransactionDecoder,
  getTransactionEncoder,
  type SignatureBytes,
} from '@solana/kit'
import bs58 from 'bs58'

/**
 * Raw message signer. In production this wraps
 * `openfort.embeddedWallet.signMessage(msg, { hashMessage: false })`; in tests it
 * wraps `nacl.sign.detached`. Must return the Ed25519 signature over EXACTLY the
 * bytes it is given (no hashing), base58-encoded (Openfort's Solana convention).
 */
export type OpenfortRawSign = (message: Uint8Array) => Promise<string>

const ED25519_SIGNATURE_LEN = 64

/**
 * Decode Openfort's `signMessage` return value into the 64 raw signature bytes.
 *
 * Openfort returns a base58 string for Solana (per @openfort/react's
 * `SignedSolanaTransaction.signature`). We treat base58 as the contract but
 * defensively accept 0x-prefixed hex, and HARD-ASSERT a 64-byte result — a
 * wrong-length signature must fail loudly here, never reach the chain.
 */
export function decodeEd25519Signature(signature: string): Uint8Array {
  let bytes: Uint8Array
  if (signature.startsWith('0x')) {
    const hex = signature.slice(2)
    if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
      throw new Error('Openfort signature: malformed hex string')
    }
    bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    }
  } else {
    // base58 (default / documented Openfort Solana encoding)
    bytes = bs58.decode(signature)
  }
  if (bytes.length !== ED25519_SIGNATURE_LEN) {
    throw new Error(
      `Openfort signature: expected ${ED25519_SIGNATURE_LEN} bytes, got ${bytes.length}. ` +
        'Refusing to broadcast a malformed signature.'
    )
  }
  return bytes
}

/**
 * Sign a compiled Solana transaction with an Openfort embedded wallet.
 *
 * @param signMessage   raw Ed25519 signer over the given bytes (see OpenfortRawSign)
 * @param txBytes       compiled wire transaction with an empty signature slot
 * @param signerAddress base58 address of the Openfort wallet (must be a required signer)
 * @returns the fully-serialized, signed wire transaction, ready to broadcast
 *
 * @throws if `signerAddress` is not a required signer of the transaction, or if
 *         the returned signature is not exactly 64 bytes.
 */
export async function openfortSignOnly(
  signMessage: OpenfortRawSign,
  txBytes: Uint8Array,
  signerAddress: string
): Promise<Uint8Array> {
  const decoded = getTransactionDecoder().decode(txBytes)
  const addr = toAddress(signerAddress)

  // The decoder pre-populates `signatures` with one entry per required signer
  // (value `null` until signed). If our address isn't there, the transaction was
  // not built for this wallet — refuse rather than produce an unverifiable tx.
  if (!(addr in decoded.signatures)) {
    throw new Error(
      `Openfort signer ${signerAddress} is not a required signer of this transaction.`
    )
  }

  // Sign the canonical message bytes (what Solana actually verifies), never the
  // wire bytes. `messageBytes` is exactly the region the network hashes per signer.
  const signatureString = await signMessage(new Uint8Array(decoded.messageBytes))
  const signatureBytes = decodeEd25519Signature(signatureString) as SignatureBytes

  const signed = {
    ...decoded,
    signatures: { ...decoded.signatures, [addr]: signatureBytes },
  }
  return new Uint8Array(getTransactionEncoder().encode(signed))
}
