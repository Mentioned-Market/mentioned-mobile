// A legacy Privy wallet signs through the same ported path as Openfort. This
// proves the adapter end to end with no Privy credentials: a local Ed25519
// keypair stands in for Privy's wallet, speaking Privy's `signMessage`
// contract (base64 message in, base64 signature out), and the transaction
// that comes back must carry a signature that verifies against the message.
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

import { openfortSignOnly } from '@/auth/signer';
import { rawSignWithPrivy, type PrivySolanaProvider } from '@/trade/privy-signer';

function buildUnsignedTx(feePayer: string): Uint8Array {
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

/** A stand-in for Privy's embedded Solana provider, backed by a local key. */
function fakePrivyWallet(opts: { signature?: (sig: Uint8Array) => string } = {}) {
  const keypair = nacl.sign.keyPair();
  const requests: { method: string; params: { message: string } }[] = [];
  const provider: PrivySolanaProvider = {
    request: async (args) => {
      requests.push(args);
      const message = new Uint8Array(Buffer.from(args.params.message, 'base64'));
      const sig = nacl.sign.detached(message, keypair.secretKey);
      return { signature: opts.signature ? opts.signature(sig) : Buffer.from(sig).toString('base64') };
    },
  };
  return { addr: bs58.encode(keypair.publicKey), keypair, provider, requests };
}

describe('rawSignWithPrivy', () => {
  it('produces a transaction whose signature verifies against the message', async () => {
    const wallet = fakePrivyWallet();
    const signed = await openfortSignOnly(rawSignWithPrivy(async () => wallet.provider), buildUnsignedTx(wallet.addr), wallet.addr);

    const decoded = getTransactionDecoder().decode(signed);
    const sig = decoded.signatures[address(wallet.addr)];
    expect(sig).not.toBeNull();
    expect(nacl.sign.detached.verify(new Uint8Array(decoded.messageBytes), new Uint8Array(sig!), wallet.keypair.publicKey)).toBe(true);
  });

  it('asks Privy to sign the message bytes, base64 encoded, through signMessage', async () => {
    const wallet = fakePrivyWallet();
    const tx = buildUnsignedTx(wallet.addr);
    await openfortSignOnly(rawSignWithPrivy(async () => wallet.provider), tx, wallet.addr);

    expect(wallet.requests).toHaveLength(1);
    expect(wallet.requests[0].method).toBe('signMessage');
    const sent = Buffer.from(wallet.requests[0].params.message, 'base64');
    expect(sent.equals(Buffer.from(getTransactionDecoder().decode(tx).messageBytes))).toBe(true);
  });

  it('returns the signature as base58, which the ported signer parses', async () => {
    const wallet = fakePrivyWallet();
    const out = await rawSignWithPrivy(async () => wallet.provider)(new Uint8Array([1, 2, 3]));
    expect(bs58.decode(out)).toHaveLength(64);
  });

  it('refuses a signature that is not 64 bytes', async () => {
    const wallet = fakePrivyWallet({ signature: (sig) => Buffer.from(sig.slice(0, 63)).toString('base64') });
    await expect(rawSignWithPrivy(async () => wallet.provider)(new Uint8Array([1]))).rejects.toThrow(/expected 64 bytes, got 63/);
  });

  it('refuses an empty answer', async () => {
    const provider: PrivySolanaProvider = { request: async () => ({ signature: '' }) };
    await expect(rawSignWithPrivy(async () => provider)(new Uint8Array([1]))).rejects.toThrow(/no signature/);
  });

  it('fetches the provider for each signature', async () => {
    const wallet = fakePrivyWallet();
    const getProvider = jest.fn(async () => wallet.provider);
    const sign = rawSignWithPrivy(getProvider);
    await sign(new Uint8Array([1]));
    await sign(new Uint8Array([2]));
    expect(getProvider).toHaveBeenCalledTimes(2);
  });
});
