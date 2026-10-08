// The two byte formats a Seeker account depends on: the message the website
// verifies at sign-in, and the transaction the Seed Vault is shown for a trade.
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  getTransactionDecoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  AccountRole,
  type Blockhash,
} from '@solana/kit';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

import { buildSeekerSignInMessage, isWalletCancel, requiredSignatures, sameBytes, unsignedWireTransaction } from '@/lib/seeker-session';

const newAddress = () => bs58.encode(nacl.sign.keyPair().publicKey);

/** A compiled transaction with `extraSigners` required signers beside the fee payer. */
function compile(feePayer: string, extraSigners: string[] = [], version: 0 | 'legacy' = 0) {
  const ix = {
    programAddress: address('ComputeBudget111111111111111111111111111111'),
    accounts: extraSigners.map((s) => ({ address: address(s), role: AccountRole.READONLY_SIGNER })),
    data: new Uint8Array([2, 64, 13, 3, 0]),
  };
  const blockhash = { blockhash: bs58.encode(nacl.randomBytes(32)) as Blockhash, lastValidBlockHeight: 123n };
  return compileTransaction(
    pipe(
      createTransactionMessage({ version }),
      (m) => setTransactionMessageFeePayer(address(feePayer), m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions([ix], m),
    ),
  );
}

describe('buildSeekerSignInMessage', () => {
  it('is the two lines the website verifies', () => {
    expect(buildSeekerSignInMessage(1791000000)).toBe('Sign in to Mentioned\nTimestamp: 1791000000');
  });

  it('writes whole seconds, since the server parses an integer', () => {
    expect(buildSeekerSignInMessage(1791000000.987)).toBe('Sign in to Mentioned\nTimestamp: 1791000000');
  });
});

describe('requiredSignatures', () => {
  it('reads the count from a versioned message', () => {
    expect(requiredSignatures(new Uint8Array(compile(newAddress()).messageBytes))).toBe(1);
    expect(requiredSignatures(new Uint8Array(compile(newAddress(), [newAddress()]).messageBytes))).toBe(2);
  });

  it('reads the count from a legacy message, which has no version byte', () => {
    expect(requiredSignatures(new Uint8Array(compile(newAddress(), [newAddress()], 'legacy').messageBytes))).toBe(2);
  });

  it('refuses bytes that name no signers', () => {
    expect(() => requiredSignatures(new Uint8Array())).toThrow(/no signers/);
    expect(() => requiredSignatures(new Uint8Array([0x80, 0]))).toThrow(/no signers/);
  });
});

describe('unsignedWireTransaction', () => {
  it('matches what kit encodes for the same unsigned transaction', () => {
    for (const tx of [compile(newAddress()), compile(newAddress(), [newAddress()]), compile(newAddress(), [], 'legacy')]) {
      const wire = new Uint8Array(getTransactionEncoder().encode(tx));
      expect(sameBytes(unsignedWireTransaction(new Uint8Array(tx.messageBytes)), wire)).toBe(true);
    }
  });

  it('decodes back to the same message with every signer unsigned', () => {
    const payer = newAddress();
    const sponsor = newAddress();
    const tx = compile(payer, [sponsor]);
    const decoded = getTransactionDecoder().decode(unsignedWireTransaction(new Uint8Array(tx.messageBytes)));
    expect(sameBytes(new Uint8Array(decoded.messageBytes), new Uint8Array(tx.messageBytes))).toBe(true);
    expect(decoded.signatures).toEqual({ [payer]: null, [sponsor]: null });
  });
});

describe('sameBytes', () => {
  it('compares length and content', () => {
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe('isWalletCancel', () => {
  it('reads the Seed Vault dismissal, which arrives as a bare Java exception name', () => {
    expect(isWalletCancel('java.util.concurrent.CancellationException')).toBe(true);
  });

  it('reads a wallet that answered with a refusal', () => {
    for (const raw of ['sign request declined', 'authorization request declined', 'Transaction not signed', 'User rejected the request', 'Request was canceled']) {
      expect(isWalletCancel(raw)).toBe(true);
    }
  });

  it('leaves real failures to be explained', () => {
    for (const raw of ['Add $3 more', 'insufficient funds', 'Blockhash not found', 'The wallet changed the transaction before signing it (the signers changed). Nothing was sent.']) {
      expect(isWalletCancel(raw)).toBe(false);
    }
  });
});
