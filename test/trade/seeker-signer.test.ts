// The Seeker signer, with a local Ed25519 keypair standing in for the Seed
// Vault. What matters is that the signature it hands the ported signer makes a
// transaction the chain would accept, and that a wallet which signs something
// other than what was simulated is caught before anything is sent.
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
  type SignatureBytes,
  type Transaction,
} from '@solana/kit';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

import { openfortSignOnly } from '@/auth/signer';
import { rawSignWithSeeker, signWithSeeker, type SeekerSignTransaction } from '@/trade/seeker-signer';

function keypair() {
  const kp = nacl.sign.keyPair();
  return { kp, addr: bs58.encode(kp.publicKey) };
}

function build(feePayer: string, extraSigners: string[] = [], withFee = false): Transaction {
  const fee = { programAddress: address('ComputeBudget111111111111111111111111111111'), accounts: [], data: new Uint8Array([3, 16, 39, 0, 0, 0, 0, 0, 0]) };
  const ix = {
    programAddress: address('ComputeBudget111111111111111111111111111111'),
    accounts: extraSigners.map((s) => ({ address: address(s), role: AccountRole.READONLY_SIGNER })),
    data: new Uint8Array([2, 64, 13, 3, 0]),
  };
  const blockhash = { blockhash: bs58.encode(nacl.randomBytes(32)) as Blockhash, lastValidBlockHeight: 123n };
  return compileTransaction(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayer(address(feePayer), m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(withFee ? [ix, fee] : [ix], m),
    ),
  );
}

const wire = (tx: Transaction) => new Uint8Array(getTransactionEncoder().encode(tx));

/** A wallet that signs what it is given, the way the Seed Vault does. */
const walletFor =
  (w: ReturnType<typeof keypair>): SeekerSignTransaction =>
  async (tx) => ({
    ...tx,
    signatures: { ...tx.signatures, [address(w.addr)]: nacl.sign.detached(new Uint8Array(tx.messageBytes), w.kp.secretKey) as SignatureBytes },
  });

describe('rawSignWithSeeker', () => {
  it('produces a transaction whose signature verifies against the wallet', async () => {
    const w = keypair();
    const tx = build(w.addr);
    const signed = getTransactionDecoder().decode(await openfortSignOnly(rawSignWithSeeker(w.addr, walletFor(w)), wire(tx), w.addr));
    const sig = signed.signatures[address(w.addr)];
    expect(sig).not.toBeNull();
    expect(nacl.sign.detached.verify(new Uint8Array(tx.messageBytes), sig as Uint8Array, w.kp.publicKey)).toBe(true);
  });

  it('shows the wallet a whole transaction, never bare message bytes', async () => {
    const w = keypair();
    const tx = build(w.addr);
    const seen: Transaction[] = [];
    const sign: SeekerSignTransaction = (t) => {
      seen.push(t);
      return walletFor(w)(t);
    };
    await openfortSignOnly(rawSignWithSeeker(w.addr, sign), wire(tx), w.addr);
    expect(seen).toHaveLength(1);
    expect(Array.from(new Uint8Array(seen[0].messageBytes))).toEqual(Array.from(new Uint8Array(tx.messageBytes)));
    expect(seen[0].signatures[address(w.addr)]).toBeNull();
  });

  it('keeps a signature already on the transaction, as a sponsored pick has', async () => {
    const sponsor = keypair();
    const w = keypair();
    const tx = build(sponsor.addr, [w.addr]);
    const sponsorSig = nacl.sign.detached(new Uint8Array(tx.messageBytes), sponsor.kp.secretKey) as SignatureBytes;
    const half = wire({ ...tx, signatures: { ...tx.signatures, [address(sponsor.addr)]: sponsorSig } });
    const signed = getTransactionDecoder().decode(await openfortSignOnly(rawSignWithSeeker(w.addr, walletFor(w)), half, w.addr));
    expect(Array.from(signed.signatures[address(sponsor.addr)] as Uint8Array)).toEqual(Array.from(sponsorSig));
    expect(nacl.sign.detached.verify(new Uint8Array(tx.messageBytes), signed.signatures[address(w.addr)] as Uint8Array, w.kp.publicKey)).toBe(true);
  });

  it('refuses a wallet that changed the transaction before signing', async () => {
    const w = keypair();
    const tx = build(w.addr);
    const other = build(w.addr);
    const sign: SeekerSignTransaction = async () => walletFor(w)(other);
    await expect(openfortSignOnly(rawSignWithSeeker(w.addr, sign), wire(tx), w.addr)).rejects.toThrow(/changed the transaction/);
  });

  it('refuses a wallet that returned the transaction unsigned', async () => {
    const w = keypair();
    const tx = build(w.addr);
    await expect(openfortSignOnly(rawSignWithSeeker(w.addr, async (t) => t), wire(tx), w.addr)).rejects.toThrow(/no signature/);
  });

  it('refuses a transaction the wallet is not a signer of', async () => {
    const w = keypair();
    const tx = build(keypair().addr);
    await expect(rawSignWithSeeker(w.addr, walletFor(w))(new Uint8Array(tx.messageBytes))).rejects.toThrow(/not a required signer/);
  });
});

describe('signWithSeeker', () => {
  it('returns the same transaction, signed, when the wallet leaves it alone', async () => {
    const w = keypair();
    const tx = build(w.addr);
    const signed = getTransactionDecoder().decode(await signWithSeeker(w.addr, walletFor(w))(wire(tx)));
    expect(Array.from(new Uint8Array(signed.messageBytes))).toEqual(Array.from(new Uint8Array(tx.messageBytes)));
    expect(nacl.sign.detached.verify(new Uint8Array(tx.messageBytes), signed.signatures[address(w.addr)] as Uint8Array, w.kp.publicKey)).toBe(true);
  });

  it('returns what the wallet signed when it added a priority fee', async () => {
    const w = keypair();
    const tx = build(w.addr);
    const withFee = build(w.addr, [], true);
    const sign: SeekerSignTransaction = async () => walletFor(w)(withFee);
    const signed = getTransactionDecoder().decode(await signWithSeeker(w.addr, sign)(wire(tx)));
    // The signature is over the wallet's message, so that message is the one sent.
    expect(Array.from(new Uint8Array(signed.messageBytes))).toEqual(Array.from(new Uint8Array(withFee.messageBytes)));
    expect(nacl.sign.detached.verify(new Uint8Array(withFee.messageBytes), signed.signatures[address(w.addr)] as Uint8Array, w.kp.publicKey)).toBe(true);
  });

  it('refuses a change that is more than a fee, and says what it was', async () => {
    const w = keypair();
    const tx = build(w.addr);
    const sign: SeekerSignTransaction = async () => walletFor(w)(build(w.addr, [keypair().addr]));
    await expect(signWithSeeker(w.addr, sign)(wire(tx))).rejects.toThrow(/changed the transaction before signing it \(the signers changed\)/);
  });

  it('refuses a transaction someone else also signs', async () => {
    const w = keypair();
    const tx = build(keypair().addr, [w.addr]);
    await expect(signWithSeeker(w.addr, walletFor(w))(wire(tx))).rejects.toThrow(/more than one signer/);
  });

  it('refuses a wallet that returned the transaction unsigned', async () => {
    const w = keypair();
    await expect(signWithSeeker(w.addr, async (t) => t)(wire(build(w.addr)))).rejects.toThrow(/no signature/);
  });
});
