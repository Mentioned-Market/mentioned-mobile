// What the Seeker's wallet may change before signing: its own priority fee,
// and nothing that decides where money goes.
import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  AccountRole,
  type Blockhash,
  type Instruction,
} from '@solana/kit';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

import { checkWalletEdit, MAX_PRIORITY_FEE_LAMPORTS, unitLimitForWalletFee } from '@/trade/wallet-edit';

const key = () => bs58.encode(nacl.sign.keyPair().publicKey);
const BUDGET = address('ComputeBudget111111111111111111111111111111');
const PROGRAM = address('F1AVzZe4oX2cNDTvJjNFGWyYz4uxXxMwEqvTnamA2j9r');
const LIGHTHOUSE = address('L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95');

const PAYER = key();
const MARKET = key();
const VAULT = key();
const USER_TOKEN = key();
const HASH = bs58.encode(nacl.randomBytes(32)) as Blockhash;

function unitLimit(units: number): Instruction {
  const data = new Uint8Array(5);
  data[0] = 2;
  new DataView(data.buffer).setUint32(1, units, true);
  return { programAddress: BUDGET, accounts: [], data };
}

function unitPrice(microLamports: bigint): Instruction {
  const data = new Uint8Array(9);
  data[0] = 3;
  new DataView(data.buffer).setBigUint64(1, microLamports, true);
  return { programAddress: BUDGET, accounts: [], data };
}

const buy = (opts: { market?: string; vault?: string; data?: number[] } = {}): Instruction => ({
  programAddress: PROGRAM,
  accounts: [
    { address: address(PAYER), role: AccountRole.WRITABLE_SIGNER },
    { address: address(opts.market ?? MARKET), role: AccountRole.WRITABLE },
    { address: address(opts.vault ?? VAULT), role: AccountRole.WRITABLE },
  ],
  data: new Uint8Array(opts.data ?? [7, 1, 0, 0, 0]),
});

function message(instructions: Instruction[], opts: { payer?: string; blockhash?: Blockhash } = {}): Uint8Array {
  const tx = compileTransaction(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayer(address(opts.payer ?? PAYER), m),
      (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: opts.blockhash ?? HASH, lastValidBlockHeight: 1n }, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    ),
  );
  return new Uint8Array(tx.messageBytes);
}

const BUILT = message([unitLimit(1_400_000), buy()]);

describe('checkWalletEdit', () => {
  it('accepts an untouched message, with no fee added', () => {
    expect(checkWalletEdit(BUILT, BUILT)).toEqual({ ok: true, priorityFeeLamports: 0n });
  });

  it('accepts an added priority fee and reports what it costs', () => {
    const signed = message([unitLimit(1_400_000), unitPrice(10_000n), buy()]);
    expect(checkWalletEdit(BUILT, signed)).toEqual({ ok: true, priorityFeeLamports: 14_000n });
  });

  it('accepts a fee placed after the trade, and a changed unit limit', () => {
    const signed = message([buy(), unitLimit(300_000), unitPrice(50_000n)]);
    expect(checkWalletEdit(BUILT, signed)).toEqual({ ok: true, priorityFeeLamports: 15_000n });
  });

  it('accepts a refreshed blockhash', () => {
    const signed = message([unitLimit(1_400_000), buy()], { blockhash: bs58.encode(nacl.randomBytes(32)) as Blockhash });
    expect(checkWalletEdit(BUILT, signed).ok).toBe(true);
  });

  it('rounds the fee up, as the chain does', () => {
    const signed = message([unitLimit(3), unitPrice(1n), buy()]);
    expect(checkWalletEdit(BUILT, signed)).toEqual({ ok: true, priorityFeeLamports: 1n });
  });

  it('prices a message with no limit at the default units', () => {
    const signed = message([unitPrice(1_000_000n), buy()]);
    expect(checkWalletEdit(BUILT, signed)).toEqual({ ok: true, priorityFeeLamports: 200_000n });
  });

  it('accepts the guard instructions a wallet adds on mainnet, around the trade', () => {
    const guard = (data: number[]): Instruction => ({
      programAddress: LIGHTHOUSE,
      accounts: [{ address: address(USER_TOKEN), role: AccountRole.READONLY }],
      data: new Uint8Array(data),
    });
    const signed = message([guard([9, 1]), unitLimit(1_400_000), buy(), unitPrice(100_000n), guard([9, 2])]);
    expect(checkWalletEdit(BUILT, signed)).toEqual({ ok: true, priorityFeeLamports: 140_000n });
  });

  it('accepts a guard that reads an account the trade writes to', () => {
    const guard: Instruction = { programAddress: LIGHTHOUSE, accounts: [{ address: address(VAULT), role: AccountRole.READONLY }], data: new Uint8Array([9]) };
    expect(checkWalletEdit(BUILT, message([unitLimit(1_400_000), buy(), guard])).ok).toBe(true);
  });

  it('accepts a guard that checks the wallet itself, which is the signer', () => {
    const guard: Instruction = { programAddress: LIGHTHOUSE, accounts: [{ address: address(PAYER), role: AccountRole.WRITABLE_SIGNER }], data: new Uint8Array([4]) };
    expect(checkWalletEdit(BUILT, message([unitLimit(1_400_000), buy(), guard])).ok).toBe(true);
  });

  it('still refuses a changed trade when guards are added around it', () => {
    const guard: Instruction = { programAddress: LIGHTHOUSE, accounts: [{ address: address(PAYER), role: AccountRole.WRITABLE_SIGNER }], data: new Uint8Array([4]) };
    const result = checkWalletEdit(BUILT, message([guard, unitLimit(1_400_000), buy({ vault: key() }), guard]));
    expect(result).toEqual({ ok: false, reason: 'instruction 1 uses different accounts' });
  });

  it('refuses a priority fee over the cap', () => {
    const over = (MAX_PRIORITY_FEE_LAMPORTS * 1_000_000n) / 1_400_000n + 10n;
    const result = checkWalletEdit(BUILT, message([unitLimit(1_400_000), unitPrice(over), buy()]));
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/priority fee/) });
  });

  it('refuses a different fee payer', () => {
    const other = key();
    const result = checkWalletEdit(BUILT, message([unitLimit(1_400_000), buy()], { payer: other }));
    expect(result).toEqual({ ok: false, reason: 'the fee payer changed' });
  });

  it('refuses an added instruction, naming its program', () => {
    const extra: Instruction = { programAddress: address('11111111111111111111111111111111'), accounts: [{ address: address(PAYER), role: AccountRole.WRITABLE_SIGNER }], data: new Uint8Array([2, 0, 0, 0]) };
    const result = checkWalletEdit(BUILT, message([unitLimit(1_400_000), buy(), extra]));
    expect(result).toEqual({ ok: false, reason: 'an instruction for 11111111111111111111111111111111 was added' });
  });

  it('refuses a removed instruction', () => {
    expect(checkWalletEdit(BUILT, message([unitLimit(1_400_000)]))).toEqual({ ok: false, reason: 'it has 0 instructions, not 1' });
  });

  it('refuses a swapped account, which is where the money would go', () => {
    const result = checkWalletEdit(BUILT, message([unitLimit(1_400_000), buy({ vault: key() })]));
    expect(result).toEqual({ ok: false, reason: 'instruction 1 uses different accounts' });
  });

  it('refuses changed instruction data, which is the amount', () => {
    const result = checkWalletEdit(BUILT, message([unitLimit(1_400_000), buy({ data: [7, 9, 0, 0, 0] })]));
    expect(result).toEqual({ ok: false, reason: 'instruction 1 carries different data' });
  });

  it('refuses a second signer', () => {
    const cosigner: Instruction = { programAddress: PROGRAM, accounts: [{ address: address(key()), role: AccountRole.READONLY_SIGNER }], data: new Uint8Array([1]) };
    expect(checkWalletEdit(BUILT, message([unitLimit(1_400_000), buy(), cosigner]))).toEqual({ ok: false, reason: 'the signers changed' });
  });

  it('refuses bytes that are not a message', () => {
    expect(checkWalletEdit(BUILT, new Uint8Array([1, 2, 3]))).toMatchObject({ ok: false });
  });
});

describe('unitLimitForWalletFee', () => {
  it('asks for what was used, with headroom and room for the wallet\'s guards', () => {
    expect(unitLimitForWalletFee(60_000, 1_400_000)).toBe(128_000);
    expect(unitLimitForWalletFee(38_326, 1_400_000)).toBe(99_824);
  });

  it('never raises the limit', () => {
    expect(unitLimitForWalletFee(1_200_000, 1_400_000)).toBeNull();
    expect(unitLimitForWalletFee(1_038_462, 1_400_000)).toBeNull();
  });

  it('gives nothing without a usable figure', () => {
    expect(unitLimitForWalletFee(0, 1_400_000)).toBeNull();
    expect(unitLimitForWalletFee(Number.NaN, 1_400_000)).toBeNull();
  });
});
