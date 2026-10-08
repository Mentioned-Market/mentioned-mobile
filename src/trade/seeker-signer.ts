// The bridge from the Seeker's Seed Vault wallet to the app's signing code, for
// an account signed in with the Seeker itself (see src/lib/seeker-session.ts).
//
// The other two signers answer in the background. This one opens the wallet
// and the person approves with the Seeker's double tap, once per transaction.
//
// A wallet is allowed to change what it signs, and the Seeker's does: it adds
// a priority fee. There are therefore two signers here.
//
// `signWithSeeker` is for a transaction this wallet alone signs, which is every
// ordinary trade. It sends what the wallet signed, once src/trade/wallet-edit.ts
// has agreed the change is a fee and nothing else. The caller simulates those
// bytes again before sending them (src/trade/send.ts).
//
// `rawSignWithSeeker` is the strict one, for a transaction someone else has
// already signed (a sponsored pick). There the wallet's signature has to fit
// the exact message the other party signed, so any change at all is refused.
import { address as toAddress, getTransactionDecoder, getTransactionEncoder, type Transaction } from '@solana/kit';
import bs58 from 'bs58';

import type { OpenfortRawSign } from '@/auth/signer';
import { sameBytes, unsignedWireTransaction } from '@/lib/seeker-session';
import { checkWalletEdit } from '@/trade/wallet-edit';

const ED25519_SIGNATURE_LEN = 64;

/** Has the wallet at `address` sign one transaction, and returns it signed. */
export type SeekerSignTransaction = (transaction: Transaction) => Promise<Transaction>;

/**
 * Adapt the Seeker wallet into the raw-bytes signer the ported signing code
 * wants. `sign` is injected so this is testable with a local keypair; the app
 * passes the Mobile Wallet Adapter call from src/chain/mwa.ts.
 */
export function rawSignWithSeeker(address: string, sign: SeekerSignTransaction): OpenfortRawSign {
  return async (message: Uint8Array): Promise<string> => {
    const signer = toAddress(address);
    const unsigned = getTransactionDecoder().decode(unsignedWireTransaction(message));
    if (!(signer in unsigned.signatures)) {
      throw new Error(`Seeker wallet ${address} is not a required signer of this transaction.`);
    }

    const signed = await sign(unsigned);
    if (!sameBytes(new Uint8Array(signed.messageBytes), message)) {
      throw new Error('The wallet changed the transaction before signing it. Nothing was sent.');
    }
    const signature = signed.signatures[signer];
    if (!signature || signature.length !== ED25519_SIGNATURE_LEN) {
      throw new Error('The wallet returned no signature for the transaction.');
    }
    return bs58.encode(signature);
  };
}

/**
 * Sign a whole wire transaction with the Seeker wallet and return the signed
 * wire transaction to send. That may not be the one passed in: see the top of
 * this file. A change that is more than a fee is refused, and says what it was.
 */
export function signWithSeeker(address: string, sign: SeekerSignTransaction): (txBytes: Uint8Array) => Promise<Uint8Array> {
  return async (txBytes: Uint8Array): Promise<Uint8Array> => {
    const signer = toAddress(address);
    const unsigned = getTransactionDecoder().decode(txBytes);
    if (!(signer in unsigned.signatures)) {
      throw new Error(`Seeker wallet ${address} is not a required signer of this transaction.`);
    }
    // The wallet may only rewrite a transaction nobody else has signed or will
    // sign: its edit would not fit anyone else's signature.
    if (Object.keys(unsigned.signatures).length !== 1) {
      throw new Error('This transaction has more than one signer, so the wallet cannot be asked to sign it this way.');
    }

    const signed = await sign(unsigned);
    const signature = signed.signatures[signer];
    if (!signature || signature.length !== ED25519_SIGNATURE_LEN) {
      throw new Error('The wallet returned no signature for the transaction.');
    }
    const edit = checkWalletEdit(new Uint8Array(unsigned.messageBytes), new Uint8Array(signed.messageBytes));
    if (!edit.ok) throw new Error(`The wallet changed the transaction before signing it (${edit.reason}). Nothing was sent.`);
    return new Uint8Array(getTransactionEncoder().encode(signed));
  };
}
