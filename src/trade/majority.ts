// Paid majority trade construction: buying words, and claiming winnings.
//
// Each word is one flat unit, and the first buyer of a word coins it, paying
// rent for the word entry and their position. That makes a basket of picks a
// series of independent buys rather than one trade, which is why this returns
// batches instead of a single instruction list.
//
// Refunds are deliberately absent. A cancelled market or a word pulled for
// moderation is settled from the admin tab on the website, never from the app
// (SPEC section 7.1).
// The on-chain normaliser, the one the buy instruction hashes with. The free
// markets have their own in majorityWords.ts that also collapses inner spaces;
// the two only differ on words a paid market could never accept, but a word's
// on-chain identity must come from exactly the function the program's PDAs use.
import { createAtaIx, createBuyIx, createClaimIx, majorityWordError, normalizeWord, USDC_MINT, wordHashHex } from '@/chain/majority';
import { address as toAddress, type Instruction } from '@solana/kit';
import { checkSlurs } from '@/lib/chatFilter';
import { TradeInputError } from '@/trade/amm';

/**
 * Buys batched into one transaction.
 *
 * Three is the website's ceiling and the reason is physical: each buy adds
 * roughly four unique accounts plus data, and a fourth overruns Solana's
 * 1232-byte transaction limit. Exceeding it fails at encoding time, after the
 * user has committed to the picks.
 */
export const BUYS_PER_TX = 3;

/** Enough SOL to cover fees and the rent a first buy of a word pays. */
export const MIN_SOL_FOR_FEES = 0.004;

export type MajorityBuyPlan = {
  /** One entry per transaction the user will be asked to sign. */
  batches: Instruction[][];
  words: string[];
  /** Dollars, one unit per word. */
  totalUsd: number;
};

/**
 * Turn a basket of picked words into the transactions that buy them.
 *
 * The USDC account is created idempotently on the first transaction only: it
 * either exists already or is made once, and repeating it in later batches
 * would waste space that the buy instructions need.
 */
export async function planMajorityBuy(opts: {
  wallet: string;
  marketId: bigint;
  /** Words as typed or tapped; normalised here, the same way the chain does. */
  words: string[];
  unitPriceUsd?: number;
}): Promise<MajorityBuyPlan> {
  const buyer = toAddress(opts.wallet);
  const words = opts.words.map(normalizeWord).filter(Boolean);
  if (words.length === 0) throw new TradeInputError('Pick at least one word.');

  const unique = [...new Set(words)];
  if (unique.length !== words.length) throw new TradeInputError('That basket has the same word twice.');

  const ataIx = await createAtaIx(buyer, buyer, USDC_MINT);
  const batches: Instruction[][] = [];
  for (let i = 0; i < unique.length; i += BUYS_PER_TX) {
    const chunk = unique.slice(i, i + BUYS_PER_TX);
    const buys = await Promise.all(chunk.map((w) => createBuyIx(buyer, opts.marketId, w, 1n)));
    batches.push(i === 0 ? [ataIx, ...buys] : buys);
  }

  return { batches, words: unique, totalUsd: unique.length * (opts.unitPriceUsd ?? 1) };
}

/** Claim winnings on a resolved word. */
export async function planMajorityClaim(opts: {
  wallet: string;
  marketId: bigint;
  word: string;
}): Promise<Instruction[]> {
  const owner = toAddress(opts.wallet);
  return [
    await createAtaIx(owner, owner, USDC_MINT),
    await createClaimIx(owner, opts.marketId, normalizeWord(opts.word)),
  ];
}

/** What a coined word is checked against, all known to the screen already. */
export type CoinContext = {
  /** Words already in the basket, normalised. */
  basket: string[];
  /** Word hashes the wallet already holds on this market. */
  ownedHashes: Set<string>;
  /** Words on the board that are being refunded, normalised. */
  refunding: Set<string>;
  /** The market's banned list, as the metadata route gives it. */
  banned: string[];
};

/**
 * Check a word someone typed before it goes in the basket. Returns the
 * normalised word, or the sentence to show instead.
 *
 * The same checks the website runs, in the same order, so a word is refused
 * here exactly when it would be refused there. Every one of them would
 * otherwise surface as a failed transaction after the user had signed: the
 * program rejects a banned word, a word being refunded, and a malformed one.
 */
export function checkCoinedWord(raw: string, ctx: CoinContext): { word: string } | { error: string } {
  const shapeError = majorityWordError(raw);
  if (shapeError) return { error: shapeError };
  if (checkSlurs(raw)) return { error: 'That word is not allowed.' };

  const word = normalizeWord(raw);
  if (ctx.banned.some((b) => normalizeWord(b) === word)) return { error: "That word isn't allowed in this market." };
  if (ctx.basket.includes(word)) return { error: 'That word is already in your picks.' };
  if (ctx.ownedHashes.has(wordHashHex(word))) return { error: 'You have already picked this word.' };
  if (ctx.refunding.has(word)) return { error: 'That word is being refunded.' };
  return { word };
}

/**
 * Plain language for a failed majority buy. The website's own mapping, so the
 * two surfaces explain the same failure the same way.
 */
export function friendlyMajorityError(raw: string): string {
  const m = raw.toLowerCase();
  // The website's mapping, in its order.
  if (m.includes('this market is closed') || m.includes('marketnotopen')) return 'This market is closed.';
  if (m.includes('trading has closed') || m.includes('tradinglocked')) return 'Trading has closed for this event.';
  if (m.includes('too common')) return 'That word is too common to pick.';
  if (m.includes("isn't allowed") || m.includes('banned')) return "That word isn't allowed in this market.";
  if (m.includes('3-12') || m.includes('wordformat')) return 'Words must be 3-12 letters, or 3-12 digits.';
  if ((m.includes('insufficient') && (m.includes('usdc') || m.includes('token'))) || m.includes('not enough usdc')) return 'Not enough USDC.';
  if ((m.includes('insufficient') && m.includes('lamport')) || m.includes('resultwithnegativelamports')) return 'Not enough SOL for network fees.';
  // Mobile additions for failures the website surfaces elsewhere.
  if (m.includes('wordwrongstate')) return 'One of those words was just removed. Take it out and try again.';
  if (m.includes('user rejected') || m.includes('declined')) return 'You cancelled the signature.';
  if (m.includes('blockhash not found')) return 'That took too long to sign. Try again.';
  return raw;
}
