// Wording for free market failures, and the username checks. The server's own
// messages include em dashes and the word "bet", which the app never shows, so
// the mapping is pinned here message by message.
import { ApiError } from '@/api/client';
import { checkFreeCoinedWord, friendlyFreeError, isRetryable, sanitise, type FreePick } from '@/trade/free';
import { usernameError, usernameSaveError } from '@/ui/username-form';

const err = (status: number, message: string) => new ApiError('/api/custom/1/trade', status, message);

describe('sanitise', () => {
  it('removes em and en dashes', () => {
    expect(sanitise('Trading too fast — wait a moment')).toBe('Trading too fast. wait a moment');
    expect(sanitise('a – b')).toBe('a. b');
  });

  it('never lets "bet" through', () => {
    expect(sanitise('Entry requires exactly 2 bets')).toBe('Entry requires exactly 2 picks');
    expect(sanitise('Each bet needs a word')).toBe('Each pick needs a word');
    expect(sanitise('No betting here')).toBe('No picking here');
  });
});

describe('friendlyFreeError', () => {
  it.each([
    [403, 'You must link your Discord account to trade on free markets', 'Free markets need a Discord account linked'],
    [403, 'You must link your Discord account to bet on free markets', 'Free markets need a Discord account linked'],
    [403, 'DISCORD_TOO_NEW', 'too new'],
    [429, 'Trading too fast — wait a moment', 'going a little fast'],
    [429, 'Too many trades — limit is 30 per 5 minutes', 'Too many trades'],
    [403, 'This word is pending resolution — trading is paused while an admin verifies the outcome.', 'paused while its outcome'],
    [400, 'Insufficient play token balance', 'Not enough play tokens.'],
    [400, 'Insufficient shares to sell', 'do not hold that many shares'],
    [409, 'Already entered this market', 'already entered'],
    [400, 'Entry requires exactly 2 bets', 'Pick exactly 2 words.'],
    [400, 'The two bets must be on different words', 'Pick different words.'],
    [401, 'Authentication required', 'Sign in to trade.'],
  ])('%s %p', (status, message, expected) => {
    const out = friendlyFreeError(err(status, message));
    expect(out).toContain(expected);
    // The two rules that hold for every message the app shows.
    expect(out).not.toMatch(/[—–]/);
    expect(out).not.toMatch(/\bbets?\b/i);
  });

  it('sanitises a message it does not recognise rather than inventing one', () => {
    expect(friendlyFreeError(err(400, 'Some new rule — about bets'))).toBe('Some new rule. about picks');
  });
});

describe('isRetryable', () => {
  it('offers no retry where another tap cannot help', () => {
    expect(isRetryable(err(403, 'You must link your Discord account to trade on free markets'))).toBe(false);
    expect(isRetryable(err(409, 'Already entered this market'))).toBe(false);
    expect(isRetryable(err(403, 'Market is locked'))).toBe(false);
  });

  it('offers a retry for a transient failure', () => {
    expect(isRetryable(err(429, 'Trading too fast — wait a moment'))).toBe(true);
    expect(isRetryable(err(500, 'Trade failed'))).toBe(true);
  });
});

describe('usernameError', () => {
  it.each(['ab', 'a'.repeat(21), 'has space', 'dash-name', 'émile'])('refuses %p', (name) => {
    expect(usernameError(name)).not.toBeNull();
  });

  it.each(['word_hunter', 'abc', 'A1_b2'])('accepts %p', (name) => {
    expect(usernameError(name)).toBeNull();
  });

  it('refuses a slur', () => {
    expect(usernameError('cunt')).toBe('That username is not allowed.');
  });
});

describe('usernameSaveError', () => {
  it('says a taken name is taken', () => {
    expect(usernameSaveError(new ApiError('/api/profile', 409, 'Username is already taken'))).toBe('That username is taken. Try another.');
  });
});

describe('checkFreeCoinedWord', () => {
  const picks: FreePick[] = [{ kind: 'word', wordId: 1, word: 'football' }];
  const ctx = { boardWords: ['football', 'fans'], picks, banned: ['Ronaldo'], required: 2 };

  it('accepts a fresh word, normalised', () => {
    expect(checkFreeCoinedWord(' Keeper ', ctx)).toEqual({ word: 'keeper' });
  });

  it('points a board word back to the board, where it must be picked', () => {
    expect(checkFreeCoinedWord('FANS', ctx)).toEqual({ error: 'That word is already on the board. Pick it from there.' });
  });

  it('refuses a banned word', () => {
    expect(checkFreeCoinedWord('ronaldo', ctx)).toEqual({ error: "That word isn't allowed in this market." });
  });

  it('refuses a mix of letters and numbers, as the free rule does', () => {
    const r = checkFreeCoinedWord('and1', ctx);
    expect('error' in r).toBe(true);
  });

  it('refuses once the entry is full', () => {
    const full = { ...ctx, picks: [...picks, { kind: 'new' as const, word: 'keeper' }] };
    expect(checkFreeCoinedWord('goalie', full)).toEqual({ error: 'Your picks are full. Remove one first.' });
  });

  it('refuses a word already picked', () => {
    const withNew = { ...ctx, picks: [{ kind: 'new' as const, word: 'keeper' }] };
    expect(checkFreeCoinedWord('KEEPER', withNew)).toEqual({ error: 'That word is already in your picks.' });
  });
});
