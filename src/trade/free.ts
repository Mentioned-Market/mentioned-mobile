// Free market trades and entries: server calls, not chain transactions.
//
// No slippage, no signing, no batching: the server holds the play-token ledger
// and applies the trade in one database transaction. What the app owns is the
// wording. Several of the server's messages contain an em dash or the word
// "bet", neither of which the app ever shows, so every message is replaced with
// the app's own sentence, and anything not recognised is sanitised rather than
// passed through raw.
import { useCallback, useState } from 'react';

import { ApiError } from '@/api/client';
import { coinedWordError, normalizeWord } from '@/chain/majorityWords';
import { checkSlurs } from '@/lib/chatFilter';
import type { Achievement } from '@/api/free';

export type ApiTradeState =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'done' }
  /** `retryable` is false when trying again cannot help, so the sheet offers Close instead. */
  | { status: 'failed'; message: string; retryable: boolean };

/** Achievements the server unlocked with a trade, as lines for the completion screen. */
export const achievementLines = (list: Achievement[]) =>
  list.map((a) => `${a.emoji} ${a.title} unlocked${a.points ? `, +${a.points} points` : ''}`).join('\n');

/** Make any server message fit to show: no em dashes, no "bet". */
export function sanitise(message: string): string {
  return message
    .replace(/\s*[—–]\s*/g, '. ')
    .replace(/\bbets\b/gi, 'picks')
    .replace(/\bbet\b/gi, 'pick')
    .replace(/\bbetting\b/gi, 'picking');
}

/**
 * Failures that another tap will not fix: the account, the market or the entry
 * itself is the problem. Offering "Try again" for these invites a loop.
 */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  const m = (error.message ?? '').toLowerCase();
  if (error.status === 401) return false;
  if (m.includes('discord') || m.includes('account locked') || m.includes('already entered')) return false;
  if (m.includes('market is locked') || m.includes('not open') || m.includes('entry is closed') || m.includes('already resolved') || m.includes('already been resolved')) return false;
  return true;
}

/** A sentence for a failed free trade or entry. */
export function friendlyFreeError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error && error.name === 'AbortError' ? 'That took too long. Check your connection and try again.' : 'Something went wrong. Try again.';
  }
  const m = (error.message ?? '').toLowerCase();

  if (error.status === 401) return 'Sign in to trade.';
  if (m.includes('discord_too_new')) return 'Your Discord account is too new to trade on free markets yet.';
  if (m.includes('discord')) {
    return 'Free markets need a Discord account linked to your Mentioned profile for now. Link one on mentioned.market, then try again.';
  }
  if (m.includes('account locked')) return 'This account is locked from trading. Contact support if you think that is a mistake.';
  if (m.includes('too fast') || m.includes('slow down')) return 'You are going a little fast. Wait a moment and try again.';
  if (m.includes('too many trades')) return 'Too many trades in a short time. Wait a few minutes and try again.';
  if (m.includes('pending resolution')) return 'Trading on this word is paused while its outcome is checked.';
  if (m.includes('already been resolved') || m.includes('already resolved')) return 'This word has already resolved.';
  if (m.includes('market is locked') || m.includes('not open') || m.includes('entry is closed')) return 'This market is closed.';
  if (m.includes('insufficient play token') || m.includes('insufficient balance')) return 'Not enough play tokens.';
  if (m.includes('insufficient shares')) return 'You do not hold that many shares.';
  if (m.includes('too small') || m.includes('minimum trade')) return 'That amount is too small. The minimum is 1 token.';
  if (m.includes('already entered')) return 'You have already entered this market.';
  if (m.startsWith('entry requires exactly')) {
    const n = /exactly (\d+)/.exec(m)?.[1];
    return n ? `Pick exactly ${n} words.` : 'Pick the required number of words.';
  }
  if (m.includes('different words')) return 'Pick different words.';
  if (m.includes('already on the board')) return 'That word is already on the board. Pick it from there.';
  if (m.includes('not allowed in this market')) return "That word isn't allowed in this market.";
  if (m.includes('not allowed') || m.includes('invalid word')) return 'That word is not allowed.';
  if (error.status >= 500) return 'The server could not complete that. Try again in a moment.';
  return sanitise(error.message || 'Something went wrong. Try again.');
}

/**
 * The same working, done and failed states the on-chain trade hook has, for
 * a server call, so the free screens reuse the same progress and completion.
 */
export function useApiTrade() {
  const [state, setState] = useState<ApiTradeState>({ status: 'idle' });

  const run = useCallback(async <T,>(call: () => Promise<T>): Promise<T | null> => {
    setState({ status: 'working' });
    try {
      const result = await call();
      setState({ status: 'done' });
      return result;
    } catch (e) {
      setState({ status: 'failed', message: friendlyFreeError(e), retryable: isRetryable(e) });
      return null;
    }
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);
  const setInputError = useCallback((message: string) => setState({ status: 'failed', message, retryable: true }), []);

  return { state, run, reset, setInputError };
}

/** One pick in a free majority entry: a word on the board, or a new one. */
export type FreePick = { kind: 'word'; wordId: number; word: string } | { kind: 'new'; word: string };

/**
 * Check a word typed into a free majority entry. The website's checks in the
 * website's order, using the free markets' own normaliser and word rule, which
 * differ slightly from the paid market's.
 */
export function checkFreeCoinedWord(
  raw: string,
  ctx: { boardWords: string[]; picks: FreePick[]; banned: string[]; required: number },
): { word: string } | { error: string } {
  const word = normalizeWord(raw);
  const formatError = coinedWordError(raw);
  if (formatError) return { error: `${formatError}.` };
  if (ctx.banned.some((b) => normalizeWord(b) === word)) return { error: "That word isn't allowed in this market." };
  if (checkSlurs(raw)) return { error: 'That word is not allowed.' };
  if (ctx.boardWords.some((b) => normalizeWord(b) === word)) return { error: 'That word is already on the board. Pick it from there.' };
  if (ctx.picks.some((p) => normalizeWord(p.word) === word)) return { error: 'That word is already in your picks.' };
  if (ctx.picks.length >= ctx.required) return { error: 'Your picks are full. Remove one first.' };
  return { word };
}
