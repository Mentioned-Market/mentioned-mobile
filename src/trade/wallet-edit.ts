// What a wallet app is allowed to change in a transaction before it signs.
//
// The Seeker's wallet does not always sign the bytes it is handed. Found on a
// Seeker on Oct 8 2026: a majority buy came back with a different message.
// Wallets do this to add a priority fee, which lives in ComputeBudget
// instructions. That is a reasonable thing for a wallet to do with its
// owner's own fee, and the wallet shows it on the approval screen.
//
// On mainnet it adds a second thing (found the same day, on the first
// production buy): instructions for Lighthouse, the assertion program wallets
// use as a guard. They make the transaction fail if it leaves the person's
// balances somewhere the wallet's own simulation did not expect. They are
// protection, not a change to the trade.
//
// So an edit is accepted only when it is those and nothing else: the same fee
// payer, the same signers, and the same instructions in the same order with
// the same accounts and data, once the wallet's own instructions are set aside
// on both sides. What counts as the wallet's own:
//
// - ComputeBudget. It can only change what the transaction costs in fees,
//   never where money goes, and the cost it can add is capped here.
// - Lighthouse. Its instructions are usually handed the person's own wallet
//   account, to check its balance, which is the signer. So this is trust in
//   that one program and it rests on three things. The program has no upgrade
//   authority (checked on mainnet Oct 8 2026), so what it does cannot be
//   swapped later. It is added by the wallet that holds the keys, which could
//   sign anything it liked without asking the app. And the edited transaction
//   is simulated again before it is sent (src/trade/send.ts).
//
// Anything else is refused, with the difference named, because it is shown on
// screen and is the only clue a release build gives.
import { getCompiledTransactionMessageDecoder } from '@solana/kit';

const COMPUTE_BUDGET = 'ComputeBudget111111111111111111111111111111';
/** Lighthouse, "the assertion protocol". Immutable: its program data has no upgrade authority. */
const LIGHTHOUSE = 'L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95';
const SET_COMPUTE_UNIT_LIMIT = 2;
const SET_COMPUTE_UNIT_PRICE = 3;
/** What a transaction is given when it sets no limit: 200,000 units per instruction. */
const DEFAULT_UNITS_PER_INSTRUCTION = 200_000;

/**
 * The most priority fee a wallet may add, in lamports (0.005 SOL). Far above
 * what a wallet adds in practice, and low enough that a wrong number cannot
 * empty the SOL someone keeps for fees.
 */
export const MAX_PRIORITY_FEE_LAMPORTS = 5_000_000n;

export type WalletEdit = { ok: true; priorityFeeLamports: bigint } | { ok: false; reason: string };

type AnyCompiled = ReturnType<ReturnType<typeof getCompiledTransactionMessageDecoder>['decode']>;
/** The two message formats in use. Anything newer is refused rather than guessed at. */
type Compiled = Extract<AnyCompiled, { version: 0 | 'legacy' }>;

const readable = (m: AnyCompiled): m is Compiled => m.version === 0 || m.version === 'legacy';

type Resolved = { program: string; accounts: string[]; data: Uint8Array };

/** How an account at `index` may be used, from where it sits in the account list. */
function role(message: Compiled, index: number): string {
  const { numSignerAccounts, numReadonlySignerAccounts, numReadonlyNonSignerAccounts } = message.header;
  const total = message.staticAccounts.length;
  const signer = index < numSignerAccounts;
  const writable = signer ? index < numSignerAccounts - numReadonlySignerAccounts : index < total - numReadonlyNonSignerAccounts;
  return `${signer ? 's' : '-'}${writable ? 'w' : '-'}`;
}

/** Instructions with indexes replaced by addresses, so two messages with different account orders compare. */
function resolve(message: Compiled): Resolved[] {
  return message.instructions.map((ix) => ({
    program: message.staticAccounts[ix.programAddressIndex],
    accounts: (ix.accountIndices ?? []).map((i) => `${message.staticAccounts[i]}:${role(message, i)}`),
    data: new Uint8Array(ix.data ?? []),
  }));
}

/** An instruction a wallet may add for itself: a fee, or a guard. */
const isWalletsOwn = (ix: Resolved) => ix.program === COMPUTE_BUDGET || ix.program === LIGHTHOUSE;

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** The priority fee a message pays, in lamports: its unit price times its unit limit. */
function priorityFee(instructions: Resolved[]): bigint {
  let limit: bigint | null = null;
  let microLamportsPerUnit = 0n;
  for (const ix of instructions) {
    if (ix.program !== COMPUTE_BUDGET) continue;
    const view = new DataView(ix.data.buffer, ix.data.byteOffset, ix.data.byteLength);
    if (ix.data[0] === SET_COMPUTE_UNIT_LIMIT && ix.data.length >= 5) limit = BigInt(view.getUint32(1, true));
    if (ix.data[0] === SET_COMPUTE_UNIT_PRICE && ix.data.length >= 9) microLamportsPerUnit = view.getBigUint64(1, true);
  }
  const others = instructions.filter((ix) => ix.program !== COMPUTE_BUDGET).length;
  const units = limit ?? BigInt(others * DEFAULT_UNITS_PER_INSTRUCTION);
  // Rounded up, as the chain does.
  return (units * microLamportsPerUnit + 999_999n) / 1_000_000n;
}

/**
 * Compare the message the app built with the one the wallet signed.
 *
 * `ok` means the two differ, if at all, only in the wallet's own instructions
 * (its fee and its guards, see the top of this file) and their blockhash, and the signed one pays a priority fee
 * within the cap. A new blockhash is allowed because it only decides how long
 * the transaction stays valid.
 */
export function checkWalletEdit(builtMessage: Uint8Array, signedMessage: Uint8Array): WalletEdit {
  let built: AnyCompiled;
  let signed: AnyCompiled;
  try {
    built = getCompiledTransactionMessageDecoder().decode(builtMessage);
    signed = getCompiledTransactionMessageDecoder().decode(signedMessage);
  } catch {
    return { ok: false, reason: 'it could not be read' };
  }
  if (!readable(built) || !readable(signed)) return { ok: false, reason: 'it is in a format this app does not read' };

  const lookups = (m: Compiled) => ('addressTableLookups' in m ? (m.addressTableLookups?.length ?? 0) : 0);
  if (lookups(built) > 0 || lookups(signed) > 0) return { ok: false, reason: 'it uses a lookup table' };
  if (signed.staticAccounts[0] !== built.staticAccounts[0]) return { ok: false, reason: 'the fee payer changed' };
  if (signed.header.numSignerAccounts !== built.header.numSignerAccounts) return { ok: false, reason: 'the signers changed' };

  const builtAll = resolve(built);
  const signedAll = resolve(signed);
  const mine = builtAll.filter((ix) => !isWalletsOwn(ix));
  const theirs = signedAll.filter((ix) => !isWalletsOwn(ix));
  if (theirs.length !== mine.length) {
    const added = theirs.find((t) => !mine.some((m) => m.program === t.program));
    return { ok: false, reason: added ? `an instruction for ${added.program} was added` : `it has ${theirs.length} instructions, not ${mine.length}` };
  }
  for (let i = 0; i < mine.length; i++) {
    const n = i + 1;
    if (theirs[i].program !== mine[i].program) return { ok: false, reason: `instruction ${n} calls a different program` };
    if (theirs[i].accounts.join() !== mine[i].accounts.join()) return { ok: false, reason: `instruction ${n} uses different accounts` };
    if (!same(theirs[i].data, mine[i].data)) return { ok: false, reason: `instruction ${n} carries different data` };
  }

  const priorityFeeLamports = priorityFee(signedAll);
  if (priorityFeeLamports > MAX_PRIORITY_FEE_LAMPORTS) {
    return { ok: false, reason: `it adds a priority fee of ${priorityFeeLamports} lamports` };
  }
  return { ok: true, priorityFeeLamports };
}
