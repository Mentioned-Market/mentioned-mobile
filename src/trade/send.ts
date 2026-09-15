// Build, simulate, sign and broadcast a set of instructions from the app.
//
// A mobile-only counterpart to the ported `sendInstructions` in src/chain/amm.ts.
// That function is byte-identical to the web and takes a kit
// `TransactionSendingSigner`, which the Openfort React Native provider does not
// supply. Rather than edit a ported file, this keeps the same shape and sources
// its signature from the provider instead.
//
// The order is deliberate: SIMULATE BEFORE SIGNING. Simulation needs no
// signature, so a malformed instruction, a locked market or an insufficient
// balance is caught and named before the user is ever asked to approve
// anything, and before a fee is spent.
import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createTransactionMessage,
  getTransactionEncoder,
  pipe,
  setTransactionMessageComputeUnitLimit,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  address as toAddress,
  type Blockhash,
  type Instruction,
  type Transaction,
} from '@solana/kit';

import { openfortSignOnly, type OpenfortRawSign } from '@/auth/signer';
import { bytesToBase64, confirmSignature, sendViaProxy } from '@/chain/rpcSend';
import { RPC_URL } from '@/config';

/** Raised when simulation rejects the transaction, carrying the program's own words. */
export class SimulationError extends Error {
  constructor(
    message: string,
    public readonly logs: string[] = [],
  ) {
    super(message);
    this.name = 'SimulationError';
  }
}

const COMPUTE_UNIT_LIMIT = 1_400_000;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status} on ${method}`);
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message ?? `RPC error on ${method}`);
  return json.result as T;
}

/**
 * Compile the instructions into an unsigned transaction for `feePayer`.
 *
 * The compiled form is what the Seeker wallet signs over MWA; everything else
 * in the app wants the wire bytes from `buildTransaction` below.
 */
export async function buildUnsignedTransaction(feePayer: string, instructions: Instruction[]): Promise<Transaction> {
  const { value } = await rpc<{ value: { blockhash: string; lastValidBlockHeight: number } }>(
    'getLatestBlockhash',
    [{ commitment: 'confirmed' }],
  );

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(toAddress(feePayer), m),
    (m) =>
      setTransactionMessageLifetimeUsingBlockhash(
        // The RPC reports the height as a JSON number; kit wants a bigint.
        { blockhash: value.blockhash as Blockhash, lastValidBlockHeight: BigInt(value.lastValidBlockHeight) },
        m,
      ),
    (m) => setTransactionMessageComputeUnitLimit(COMPUTE_UNIT_LIMIT, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );

  return compileTransaction(message);
}

/**
 * Compile the instructions into an unsigned wire transaction.
 *
 * Exported because simulation is useful on its own: the whole trade path can be
 * checked against the real programs without a wallet that can sign.
 */
export async function buildTransaction(feePayer: string, instructions: Instruction[]): Promise<Uint8Array> {
  return new Uint8Array(getTransactionEncoder().encode(await buildUnsignedTransaction(feePayer, instructions)));
}

/**
 * Ask the cluster what these instructions would do, without signing.
 *
 * Anchor puts the human-readable reason in the program logs rather than in the
 * error code, so the log is mined for it: "Add $3 more" is a better failure than
 * `{"InstructionError":[0,{"Custom":6002}]}`.
 */
export async function simulate(txBytes: Uint8Array): Promise<string[]> {
  const result = await rpc<{ value: { err: unknown; logs: string[] | null } }>('simulateTransaction', [
    bytesToBase64(txBytes),
    { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed' },
  ]);

  const logs = result.value.logs ?? [];
  if (!result.value.err) return logs;

  for (const line of logs) {
    const match = line.match(/Error Message: (.+)/);
    if (match) throw new SimulationError(match[1], logs);
  }
  const summary = logs.filter((l) => l.startsWith('Program log:') || l.includes('failed')).slice(-6).join('\n');
  throw new SimulationError(`Simulation failed: ${JSON.stringify(result.value.err)}${summary ? `\n${summary}` : ''}`, logs);
}

/**
 * The whole path: build, simulate, sign, broadcast, confirm.
 *
 * A confirmation timeout throws `ConfirmationTimeoutError` from the ported
 * broadcast helper, which explicitly means the transaction MAY STILL LAND.
 * Callers must never present that as a failure.
 */
/** The observable stages of a send, in order. */
export type SendStep = 'checking' | 'signing' | 'confirming';

export async function sendInstructions(opts: {
  wallet: string;
  rawSign: OpenfortRawSign;
  instructions: Instruction[];
  /** Set false to skip the pre-flight simulation. Only for a retry of a proven build. */
  simulateFirst?: boolean;
  /** Told as each stage starts, so a progress UI can say what is actually happening. */
  onStep?: (step: SendStep) => void;
}): Promise<string> {
  opts.onStep?.('checking');
  const txBytes = await buildTransaction(opts.wallet, opts.instructions);
  if (opts.simulateFirst !== false) await simulate(txBytes);

  opts.onStep?.('signing');
  const signed = await openfortSignOnly(opts.rawSign, txBytes, opts.wallet);

  opts.onStep?.('confirming');
  const signature = await sendViaProxy(signed, RPC_URL);
  await confirmSignature(signature, { proxyUrl: RPC_URL });
  return signature;
}
