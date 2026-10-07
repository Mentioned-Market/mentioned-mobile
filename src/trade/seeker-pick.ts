// The Seeker's free pick: one majority pick, paid for by the website's funder.
//
// The welcome stake used to be cash, $1 sent to the app wallet, and people
// withdrew it straight back to their Seeker. Now the server builds one
// transaction that moves the dollar in and spends it on the pick in the same
// breath (web: lib/seekerFreePick.ts), so it can only ever become a position.
// The funder pays the fee and signs first; this wallet co-signs as the buyer.
//
// That makes it the one transaction in the app that the app did not build. So
// before it is simulated or signed it is read, and refused unless it is
// exactly what was asked for: `checkSeekerPickTransaction` below. A wallet
// that signs whatever a server hands it is one bad deploy away from signing a
// withdrawal.
//
// The server never signs a second pick while the first could still land, so
// nothing here retries by starting again. After the co-signed bytes are sent
// the only question left is whether they landed, and a slow answer is "may
// still land", never a failure.
import { getCompiledTransactionMessageDecoder, getTransactionDecoder, address as toAddress, type Address } from '@solana/kit';

import { ApiError } from '@/api/client';
import { buildSeekerPick, submitSeekerPick, type SeekerStatus } from '@/api/seeker';
import { openfortSignOnly, type OpenfortRawSign } from '@/auth/signer';
import { ASSOCIATED_TOKEN_PROGRAM, SYSTEM_PROGRAM, TOKEN_PROGRAM } from '@/chain/amm';
import { createBuyIx, PROGRAM_ID as MAJORITY_PROGRAM } from '@/chain/majority';
import { ConfirmationTimeoutError } from '@/chain/rpcSend';
import { base64ToBytes, bytesToBase64 } from '@/lib/bytes';
import { errorMessage } from '@/lib/error-message';
import { friendlyMajorityError } from '@/trade/majority';
import { simulate, type SendStep } from '@/trade/send';

const COMPUTE_BUDGET_PROGRAM = toAddress('ComputeBudget111111111111111111111111111111');

/** Raised when the server's transaction is not the pick that was asked for. Nothing was signed. */
export class UnexpectedPickError extends Error {
  constructor(reason: string) {
    super(`The free pick was not what was asked for (${reason}). Nothing was signed.`);
    this.name = 'UnexpectedPickError';
  }
}

const same = <T>(a: ArrayLike<T>, b: ArrayLike<T>) => a.length === b.length && Array.from(a).every((v, i) => v === b[i]);

/**
 * Refuse the server's transaction unless it is one sponsored pick of `word` on
 * `marketId` for `wallet`, and nothing else. Throws `UnexpectedPickError`.
 *
 * What is allowed is spelled out, not what is forbidden:
 *   - someone else pays the fee, and this wallet is a required signer
 *   - every account is named in the transaction (no lookup tables, which
 *     would hide what an instruction touches)
 *   - the only programs are Compute Budget, System, Token, the token account
 *     program and the majority program
 *   - this wallet's signature is used by exactly one instruction: the buy the
 *     app would have built itself for that word, byte for byte. Anywhere else
 *     it only receives: SOL from a plain System transfer, and ownership of
 *     the token account that is created. It never appears in a Token
 *     instruction, so its signature cannot move anything else it holds.
 */
export async function checkSeekerPickTransaction(txBytes: Uint8Array, wallet: string, marketId: bigint, word: string): Promise<void> {
  const me = toAddress(wallet);
  const message = getCompiledTransactionMessageDecoder().decode(getTransactionDecoder().decode(txBytes).messageBytes);
  // The server builds a v0 transaction; any other layout is not ours to read.
  if (message.version !== 0) throw new UnexpectedPickError('wrong transaction version');
  if ((message.addressTableLookups?.length ?? 0) > 0) throw new UnexpectedPickError('uses a lookup table');

  const accounts = message.staticAccounts;
  const signers = accounts.slice(0, message.header.numSignerAccounts);
  if (accounts[0] === me) throw new UnexpectedPickError('this wallet would pay the fee');
  if (!signers.includes(me)) throw new UnexpectedPickError('this wallet is not a signer');

  const expected = await createBuyIx(me, marketId, word, 1n);
  const expectedAccounts = (expected.accounts ?? []).map((a) => a.address);
  let buys = 0;

  for (const ix of message.instructions) {
    const program = accounts[ix.programAddressIndex];
    const touched: Address[] = (ix.accountIndices ?? []).map((i) => accounts[i]);
    switch (program) {
      case COMPUTE_BUDGET_PROGRAM:
        break;
      case SYSTEM_PROGRAM:
        // Only a plain transfer (instruction 2), and only into this wallet.
        // Every other System instruction either spends from its first account
        // or takes a second signer, and this wallet must be neither.
        if (!same(Array.from(ix.data ?? []).slice(0, 4), [2, 0, 0, 0])) throw new UnexpectedPickError('an unexpected System instruction');
        if (touched.some((a, i) => a === me && i !== 1)) throw new UnexpectedPickError('this wallet would pay');
        break;
      case ASSOCIATED_TOKEN_PROGRAM:
        // Accounts are payer, the new token account, then its owner. This
        // wallet may own the account that is made, and never pays for it.
        if (touched.some((a, i) => a === me && i !== 2)) throw new UnexpectedPickError('this wallet would pay');
        break;
      case TOKEN_PROGRAM:
        // The dollar arrives in this wallet's token account, which is a
        // different address. The wallet itself has no part in a Token call.
        if (touched.includes(me)) throw new UnexpectedPickError('this wallet would authorize a token transfer');
        break;
      case MAJORITY_PROGRAM:
        buys += 1;
        if (!same(touched, expectedAccounts) || !same<number>(ix.data ?? [], expected.data ?? [])) {
          throw new UnexpectedPickError('a different pick');
        }
        break;
      default:
        throw new UnexpectedPickError('an unexpected program');
    }
  }
  if (buys !== 1) throw new UnexpectedPickError(buys === 0 ? 'no pick in it' : 'more than one pick');
}

/**
 * What a failed free pick says. The server's refusals arrive as sentences
 * written for the person and pass through; the rest is the app's own wording
 * for a chain refusal, a timeout or no connection.
 */
export function friendlyPickError(raw: string): string {
  if (/^\/api\//.test(raw)) return 'Mentioned is having trouble. Try again shortly.';
  if (/abort/i.test(raw)) return 'That took too long. Check your connection.';
  return friendlyMajorityError(errorMessage(new Error(raw)));
}

/** How often, and how many times, the app asks whether a sent pick has landed. */
const POLL_MS = 3000;
const POLLS = 8;

type Deps = {
  build: typeof buildSeekerPick;
  submit: typeof submitSeekerPick;
  simulate: typeof simulate;
  wait: (ms: number) => Promise<void>;
};

const defaults: Deps = { build: buildSeekerPick, submit: submitSeekerPick, simulate, wait: (ms) => new Promise((r) => setTimeout(r, ms)) };

/**
 * The whole free pick: ask the server for it, check it, simulate it, co-sign
 * it, hand it back to be broadcast, and wait for it to land. Returns the
 * transaction's signature.
 *
 * Simulated before signing, like every transaction the app sends. Throws
 * `ConfirmationTimeoutError` when the pick was sent and has not been seen
 * yet: it may still land, and must not be presented as a failure.
 */
export async function sendSeekerPick(
  opts: {
    wallet: string;
    rawSign: OpenfortRawSign;
    marketId: string;
    word: string;
    onStep?: (step: SendStep) => void;
    /** Told where the Seeker perk stands once the server has said. */
    onStatus?: (status: SeekerStatus) => void;
  },
  deps: Deps = defaults,
): Promise<string> {
  opts.onStep?.('checking');
  const built = await deps.build({ marketId: opts.marketId, word: opts.word });
  const txBytes = base64ToBytes(built.txBase64);
  await checkSeekerPickTransaction(txBytes, opts.wallet, BigInt(opts.marketId), opts.word);
  await deps.simulate(txBytes);

  opts.onStep?.('signing');
  const signed = await openfortSignOnly(opts.rawSign, txBytes, opts.wallet);

  opts.onStep?.('confirming');
  const landed = (status: SeekerStatus) => {
    opts.onStatus?.(status);
    return status.freePick.status === 'used';
  };
  try {
    if (landed(await deps.submit(bytesToBase64(signed)))) return built.signature;
  } catch (e) {
    // The server answered and refused: that is an answer. Anything else (a
    // timeout, a dropped connection) says nothing about the bytes, which may
    // already be on their way, so it is asked about below, not sent again.
    if (e instanceof ApiError) throw e;
  }

  for (let i = 0; i < POLLS; i++) {
    await deps.wait(POLL_MS);
    try {
      if (landed(await deps.submit())) return built.signature;
    } catch (e) {
      // The chain proved it did not land (it failed, or its blockhash
      // expired): the server says so in a sentence, and the pick is free again.
      if (e instanceof ApiError && (e.code === 'PICK_FAILED' || e.code === 'NO_PICK')) throw e;
      // A missed poll is not a failed transaction.
    }
  }
  throw new ConfirmationTimeoutError(built.signature);
}
