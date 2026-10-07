// The free Seeker pick is the one transaction the app signs without having
// built it. These tests are about what it will and will not put a signature
// on, and about never calling a sent pick a failure.
import {
  AccountRole,
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
  type Instruction,
} from '@solana/kit';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

import { ApiError } from '@/api/client';
import type { SeekerStatus } from '@/api/seeker';
import type { OpenfortRawSign } from '@/auth/signer';
import { ASSOCIATED_TOKEN_PROGRAM, getAssociatedTokenAddress, SYSTEM_PROGRAM, TOKEN_PROGRAM, USDC_MINT } from '@/chain/amm';
import { createBuyIx } from '@/chain/majority';
import { ConfirmationTimeoutError } from '@/chain/rpcSend';
import { bytesToBase64 } from '@/lib/bytes';
import { checkSeekerPickTransaction, friendlyPickError, sendSeekerPick, UnexpectedPickError } from '@/trade/seeker-pick';

const MARKET = 1789117562931n;
const WORD = 'penalty';

const keypair = nacl.sign.keyPair();
const WALLET = bs58.encode(keypair.publicKey);
const FUNDER = bs58.encode(nacl.sign.keyPair().publicKey);
const me = address(WALLET);
const funder = address(FUNDER);

const u64 = (n: bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
};

/** System transfer: instruction 2, then lamports. */
const solTransfer = (from: string, to: string, lamports = 6_000_000n): Instruction => ({
  programAddress: SYSTEM_PROGRAM,
  accounts: [
    { address: address(from), role: AccountRole.WRITABLE_SIGNER },
    { address: address(to), role: AccountRole.WRITABLE },
  ],
  data: new Uint8Array([2, 0, 0, 0, ...u64(lamports)]),
});

const createAta = async (payer: string, owner: string): Promise<Instruction> => ({
  programAddress: ASSOCIATED_TOKEN_PROGRAM,
  accounts: [
    { address: address(payer), role: AccountRole.WRITABLE_SIGNER },
    { address: await getAssociatedTokenAddress(USDC_MINT, address(owner)), role: AccountRole.WRITABLE },
    { address: address(owner), role: AccountRole.READONLY },
    { address: USDC_MINT, role: AccountRole.READONLY },
    { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
    { address: TOKEN_PROGRAM, role: AccountRole.READONLY },
  ],
  data: new Uint8Array([1]),
});

/** Token transferChecked: source, mint, destination, authority. */
const usdcTransfer = async (authority: string, toOwner: string): Promise<Instruction> => ({
  programAddress: TOKEN_PROGRAM,
  accounts: [
    { address: await getAssociatedTokenAddress(USDC_MINT, address(authority)), role: AccountRole.WRITABLE },
    { address: USDC_MINT, role: AccountRole.READONLY },
    { address: await getAssociatedTokenAddress(USDC_MINT, address(toOwner)), role: AccountRole.WRITABLE },
    { address: address(authority), role: AccountRole.READONLY_SIGNER },
  ],
  data: new Uint8Array([12, ...u64(1_000_000n), 6]),
});

function compile(feePayer: string, instructions: Instruction[]): Uint8Array {
  const blockhash = { blockhash: bs58.encode(nacl.randomBytes(32)) as Blockhash, lastValidBlockHeight: 123n };
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(address(feePayer), m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  return new Uint8Array(getTransactionEncoder().encode(compileTransaction(msg)));
}

/** The transaction the server builds, as web lib/seekerFreePick.ts orders it. */
const sponsored = async (word = WORD, market = MARKET) => [
  solTransfer(FUNDER, WALLET),
  await createAta(FUNDER, WALLET),
  await usdcTransfer(FUNDER, WALLET),
  await createBuyIx(me, market, word, 1n),
];

const check = (tx: Uint8Array) => checkSeekerPickTransaction(tx, WALLET, MARKET, WORD);

describe('checkSeekerPickTransaction', () => {
  it('accepts the sponsored pick that was asked for', async () => {
    await expect(check(compile(FUNDER, await sponsored()))).resolves.toBeUndefined();
  });

  it('refuses a pick on another word', async () => {
    await expect(check(compile(FUNDER, await sponsored('offside')))).rejects.toThrow('a different pick');
  });

  it('refuses a pick on another market', async () => {
    await expect(check(compile(FUNDER, await sponsored(WORD, MARKET + 1n)))).rejects.toThrow('a different pick');
  });

  it('refuses more than one unit', async () => {
    const ixs = await sponsored();
    ixs[3] = await createBuyIx(me, MARKET, WORD, 5n);
    await expect(check(compile(FUNDER, ixs))).rejects.toThrow('a different pick');
  });

  it('refuses a transaction this wallet would pay the fee for', async () => {
    await expect(check(compile(WALLET, await sponsored()))).rejects.toThrow('pay the fee');
  });

  it('refuses SOL leaving this wallet', async () => {
    const ixs = [...(await sponsored()), solTransfer(WALLET, FUNDER, 1_000_000_000n)];
    await expect(check(compile(FUNDER, ixs))).rejects.toThrow('this wallet would pay');
  });

  it('refuses a token transfer this wallet authorizes', async () => {
    // The drain that matters: the wallet's USDC, signed away alongside the pick.
    const ixs = [...(await sponsored()), await usdcTransfer(WALLET, FUNDER)];
    await expect(check(compile(FUNDER, ixs))).rejects.toThrow('authorize a token transfer');
  });

  it('refuses a System instruction that is not a plain transfer', async () => {
    // Assign: hands the account to another program.
    const assign: Instruction = {
      programAddress: SYSTEM_PROGRAM,
      accounts: [{ address: me, role: AccountRole.WRITABLE_SIGNER }],
      data: new Uint8Array([1, 0, 0, 0, ...new Uint8Array(32)]),
    };
    await expect(check(compile(FUNDER, [...(await sponsored()), assign]))).rejects.toThrow('unexpected System instruction');
  });

  it('refuses this wallet paying for a token account', async () => {
    const ixs = [...(await sponsored()), await createAta(WALLET, FUNDER)];
    await expect(check(compile(FUNDER, ixs))).rejects.toThrow('this wallet would pay');
  });

  it('refuses a program it does not know', async () => {
    const memo: Instruction = { programAddress: address('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'), accounts: [], data: new Uint8Array([1]) };
    await expect(check(compile(FUNDER, [...(await sponsored()), memo]))).rejects.toThrow('unexpected program');
  });

  it('refuses a second pick in the same transaction', async () => {
    const ixs = [...(await sponsored()), await createBuyIx(me, MARKET, WORD, 1n)];
    await expect(check(compile(FUNDER, ixs))).rejects.toThrow('more than one pick');
  });

  it('refuses a transaction with no pick in it', async () => {
    const ixs = (await sponsored()).slice(0, 3);
    // Without the buy this wallet is not a signer at all.
    await expect(check(compile(FUNDER, ixs))).rejects.toThrow(UnexpectedPickError);
  });
});

describe('sendSeekerPick', () => {
  const rawSign: OpenfortRawSign = async (message) => bs58.encode(nacl.sign.detached(message, keypair.secretKey));
  const status = (pick: SeekerStatus['freePick']['status']): SeekerStatus => ({
    linked: true,
    seekerWallet: FUNDER,
    verifiedAt: null,
    grant: { status: 'unavailable', usdcBaseUnits: '1000000', lamports: '6000000', signature: null },
    freePick: { status: pick, usdcBaseUnits: '1000000', marketId: String(MARKET), word: WORD, signature: 'sig' },
  });
  const built = async (ixs?: Instruction[]) => ({
    txBase64: bytesToBase64(compile(FUNDER, ixs ?? (await sponsored()))),
    signature: 'funderSig',
    marketId: String(MARKET),
    word: WORD,
  });
  const run = (deps: Partial<Parameters<typeof sendSeekerPick>[1]>, steps: string[] = []) =>
    sendSeekerPick(
      { wallet: WALLET, rawSign, marketId: String(MARKET), word: WORD, onStep: (s) => steps.push(s) },
      { build: async () => built(), submit: async () => status('used'), simulate: async () => [], wait: async () => {}, ...deps },
    );

  it('simulates before signing, then submits this wallet\'s signature over the same message', async () => {
    const order: string[] = [];
    let sent: string | undefined;
    const signature = await run(
      {
        simulate: async () => {
          order.push('simulate');
          return [];
        },
        submit: async (tx?: string) => {
          order.push('submit');
          sent = tx;
          return status('used');
        },
      },
      order,
    );
    expect(signature).toBe('funderSig');
    expect(order).toEqual(['checking', 'simulate', 'signing', 'confirming', 'submit']);

    const original = getTransactionDecoder().decode(Buffer.from((await built()).txBase64, 'base64'));
    const signed = getTransactionDecoder().decode(Buffer.from(sent!, 'base64'));
    const mine = signed.signatures[me]!;
    expect(nacl.sign.detached.verify(new Uint8Array(signed.messageBytes), new Uint8Array(mine), keypair.publicKey)).toBe(true);
    // The funder's slot is left exactly as it came.
    expect(signed.signatures[funder]).toEqual(original.signatures[funder]);
  });

  it('signs nothing when the transaction is not the pick asked for', async () => {
    const sign = jest.fn(rawSign);
    const drain = [...(await sponsored()), await usdcTransfer(WALLET, FUNDER)];
    await expect(
      sendSeekerPick(
        { wallet: WALLET, rawSign: sign, marketId: String(MARKET), word: WORD },
        { build: async () => built(drain), submit: async () => status('used'), simulate: async () => [], wait: async () => {} },
      ),
    ).rejects.toThrow(UnexpectedPickError);
    expect(sign).not.toHaveBeenCalled();
  });

  it('signs nothing when simulation fails', async () => {
    const submit = jest.fn(async () => status('used'));
    await expect(
      run({
        simulate: async () => {
          throw new Error('Market is locked');
        },
        submit,
      }),
    ).rejects.toThrow('Market is locked');
    expect(submit).not.toHaveBeenCalled();
  });

  it('keeps asking after a 202, and never sends the transaction a second time', async () => {
    const calls: (string | undefined)[] = [];
    const answers = [status('processing'), status('processing'), status('used')];
    const signature = await run({
      submit: async (tx?: string) => {
        calls.push(tx);
        return answers[calls.length - 1];
      },
    });
    expect(signature).toBe('funderSig');
    expect(calls).toHaveLength(3);
    expect(calls[0]).toBeDefined();
    expect(calls.slice(1)).toEqual([undefined, undefined]);
  });

  it('treats a dropped connection on submit as unknown, and asks', async () => {
    let n = 0;
    const signature = await run({
      submit: async () => {
        n += 1;
        if (n === 1) throw new Error('Network request failed');
        return status('used');
      },
    });
    expect(signature).toBe('funderSig');
  });

  it('passes on a refusal from the server', async () => {
    await expect(
      run({
        submit: async () => {
          throw new ApiError('/api/seeker/free-pick/submit', 502, 'The pick could not be placed.', 'PICK_REJECTED');
        },
      }),
    ).rejects.toThrow('The pick could not be placed.');
  });

  it('stops asking once the chain proves it did not land', async () => {
    let n = 0;
    await expect(
      run({
        submit: async () => {
          n += 1;
          if (n === 1) return status('processing');
          throw new ApiError('/api/seeker/free-pick/submit', 502, 'The pick did not go through.', 'PICK_FAILED');
        },
      }),
    ).rejects.toThrow('did not go through');
    expect(n).toBe(2);
  });

  it('says "may still land", not "failed", when it is never seen', async () => {
    await expect(run({ submit: async () => status('processing') })).rejects.toBeInstanceOf(ConfirmationTimeoutError);
  });
});

describe('friendlyPickError', () => {
  it('passes on a sentence the server wrote for the person', () => {
    const said = 'A free pick is already being placed. Give it a minute, then try again.';
    expect(friendlyPickError(said)).toBe(said);
  });

  it('puts a chain refusal in the app\'s words', () => {
    expect(friendlyPickError('TradingLocked')).toBe('Trading has closed for this event.');
  });

  it('never shows a route, a timeout or a socket error raw', () => {
    expect(friendlyPickError('/api/seeker/free-pick/build -> 500')).toBe('Mentioned is having trouble. Try again shortly.');
    expect(friendlyPickError('Aborted')).toBe('That took too long. Check your connection.');
    expect(friendlyPickError('Network request failed')).toMatch(/offline/);
  });
});
