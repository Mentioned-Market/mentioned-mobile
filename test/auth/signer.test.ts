// PORTED_FROM mentioned/scripts/test-openfort-signer.ts
// Same assertions as the web's script, expressed as Jest cases.
//
// This proves src/auth/signer.ts assembles a cryptographically valid signed
// Solana transaction with no Openfort credentials at all: a local Ed25519
// keypair stands in for Openfort's remote signer, signing exactly the bytes it
// is handed and returning base58, which is Openfort's Solana convention.
//
// The one thing that cannot be checked without live keys is Openfort's actual
// signMessage return encoding. That is isolated to decodeEd25519Signature,
// which is asserted here for both base58 and 0x-hex, and which hard-fails on
// any length but 64 so a malformed signature can never reach the chain.
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
  type Blockhash,
} from '@solana/kit';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

import { decodeEd25519Signature, openfortSignOnly, type OpenfortRawSign } from '@/auth/signer';

/** A compiled wire tx with an empty signature slot: what signOnly receives. */
function buildUnsignedTx(feePayer: string): Uint8Array {
  // Account-free ComputeBudget SetComputeUnitLimit instruction. Minimal, but
  // still requires the fee payer's signature, because fee payers always sign.
  const data = new Uint8Array(5);
  data[0] = 0x02;
  new DataView(data.buffer).setUint32(1, 200_000, true);
  const ix = { programAddress: address('ComputeBudget111111111111111111111111111111'), accounts: [], data };
  const blockhash = { blockhash: bs58.encode(nacl.randomBytes(32)) as Blockhash, lastValidBlockHeight: 123n };
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(address(feePayer), m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions([ix], m),
  );
  return new Uint8Array(getTransactionEncoder().encode(compileTransaction(msg)));
}

function localSigner() {
  const keypair = nacl.sign.keyPair();
  const addr = bs58.encode(keypair.publicKey);
  let lastMessage: Uint8Array | null = null;
  const sign: OpenfortRawSign = async (message) => {
    lastMessage = message;
    return bs58.encode(nacl.sign.detached(message, keypair.secretKey));
  };
  return { keypair, addr, sign, seen: () => lastMessage };
}

const same = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));

describe('openfortSignOnly', () => {
  it('signs the canonical message bytes, not the wire transaction', async () => {
    const signer = localSigner();
    const txBytes = buildUnsignedTx(signer.addr);
    const canonical = new Uint8Array(getTransactionDecoder().decode(txBytes).messageBytes);

    await openfortSignOnly(signer.sign, txBytes, signer.addr);

    const handed = signer.seen();
    expect(handed).not.toBeNull();
    expect(same(handed as unknown as Uint8Array, canonical)).toBe(true);
  });

  it('produces a signature that verifies against the message and public key', async () => {
    const signer = localSigner();
    const txBytes = buildUnsignedTx(signer.addr);

    const signed = await openfortSignOnly(signer.sign, txBytes, signer.addr);
    const decoded = getTransactionDecoder().decode(signed);
    const sig = decoded.signatures[address(signer.addr)];

    expect(sig).toBeTruthy();
    expect(sig!.length).toBe(64);
    expect(nacl.sign.detached.verify(new Uint8Array(decoded.messageBytes), new Uint8Array(sig!), signer.keypair.publicKey)).toBe(true);
  });

  it('leaves the message unchanged through decode, sign and re-encode', async () => {
    const signer = localSigner();
    const txBytes = buildUnsignedTx(signer.addr);
    const canonical = new Uint8Array(getTransactionDecoder().decode(txBytes).messageBytes);

    const signed = await openfortSignOnly(signer.sign, txBytes, signer.addr);

    expect(same(new Uint8Array(getTransactionDecoder().decode(signed).messageBytes), canonical)).toBe(true);
  });

  it('refuses to sign for an address that is not a required signer', async () => {
    const signer = localSigner();
    const stranger = bs58.encode(nacl.sign.keyPair().publicKey);
    const txBytes = buildUnsignedTx(signer.addr);

    await expect(openfortSignOnly(signer.sign, txBytes, stranger)).rejects.toThrow(/not a required signer/);
  });

  it('never calls the signer when the address is wrong', async () => {
    const signer = localSigner();
    const stranger = bs58.encode(nacl.sign.keyPair().publicKey);
    const txBytes = buildUnsignedTx(signer.addr);

    await openfortSignOnly(signer.sign, txBytes, stranger).catch(() => undefined);

    expect(signer.seen()).toBeNull();
  });

  it('surfaces a signer failure rather than broadcasting something unsigned', async () => {
    const signer = localSigner();
    const failing: OpenfortRawSign = async () => {
      throw new Error('user rejected');
    };
    const txBytes = buildUnsignedTx(signer.addr);

    await expect(openfortSignOnly(failing, txBytes, signer.addr)).rejects.toThrow('user rejected');
  });
});

describe('decodeEd25519Signature', () => {
  const raw = nacl.sign.detached(new Uint8Array([1, 2, 3]), nacl.sign.keyPair().secretKey);

  it('reads base58, which is what Openfort returns for Solana', () => {
    expect(same(decodeEd25519Signature(bs58.encode(raw)), raw)).toBe(true);
  });

  it('also reads 0x-prefixed hex, defensively', () => {
    expect(same(decodeEd25519Signature(`0x${Buffer.from(raw).toString('hex')}`), raw)).toBe(true);
  });

  it('refuses anything that is not 64 bytes', () => {
    // A wrong-length signature must fail loudly here, never reach the chain.
    expect(() => decodeEd25519Signature(bs58.encode(new Uint8Array(32)))).toThrow(/expected 64 bytes, got 32/);
    expect(() => decodeEd25519Signature(bs58.encode(new Uint8Array(65)))).toThrow(/expected 64 bytes, got 65/);
  });

  it('rejects malformed hex', () => {
    expect(() => decodeEd25519Signature('0xzz')).toThrow(/malformed hex/);
    expect(() => decodeEd25519Signature(`0x${'ab'.repeat(63)}c`)).toThrow(/malformed hex/);
  });
});
